import { callLLMJSON } from "@/lib/llm";
import { buildExchangeAnalysisPrompt, buildDebriefPrompt } from "@/prompts/debriefAgent";
import { makeExchangeAnalysisEntrySchema, DebriefOutputSchema, type ExchangeAnalysisEntry } from "@/lib/schemas";
import { CERT_REGISTRY, type CertId } from "@/data/domains";
import type { DebriefOutput, DomainScoreDelta, Message, ScenarioOutput } from "@/lib/types";

export async function debriefAgent(
  transcript: Message[],
  scenario: ScenarioOutput,
): Promise<{ debrief: DebriefOutput; delta: DomainScoreDelta }> {
  // Pair each user message with the counterpart message that preceded it —
  // that pair is one "exchange."
  const exchanges: { index: number; counterpartMessage: string; userMessage: string }[] = [];
  for (let i = 0; i < transcript.length; i++) {
    if (transcript[i].role !== "user") continue;
    exchanges.push({
      index: exchanges.length,
      counterpartMessage: transcript[i - 1]?.content ?? "",
      userMessage: transcript[i].content,
    });
  }

  // domainId is enum-constrained to this scenario's own targetDomains (see
  // makeExchangeAnalysisEntrySchema) — a hallucinated domain can't parse,
  // rather than being filtered out downstream after the fact.
  const exchangeSchema = makeExchangeAnalysisEntrySchema(scenario.targetDomains);

  // Each exchange scores independently by design, so Promise.all is
  // correct — the sequential version is the longest operation in the app,
  // running against a serverless function timeout on a 15-exchange
  // transcript. See CLAUDE.md, Agent Contracts.
  const exchangeAnalysis = await Promise.all(
    exchanges.map((exchange) =>
      callLLMJSON(
        exchangeSchema,
        buildExchangeAnalysisPrompt(scenario, scenario.cert, exchange.index, exchange.counterpartMessage, exchange.userMessage),
        [{ role: "user", content: "Score this exchange." }],
        { temperature: 0.1 },
      ),
    ),
  );

  const transcriptText = transcript
    .map((m) => `${m.role === "user" ? "Candidate" : scenario.clientName}: ${m.content}`)
    .join("\n\n");
  const analysisText = JSON.stringify(exchangeAnalysis, null, 2);

  const debrief = await callLLMJSON(
    DebriefOutputSchema,
    buildDebriefPrompt(scenario, analysisText, scenario.cert),
    [{ role: "user", content: `Transcript:\n\n${transcriptText}\n\nSynthesize the final debrief from the evidence above.` }],
    { temperature: 0.2 },
  );

  const delta = buildDomainScoreDelta(exchangeAnalysis, scenario.cert);

  // examIntel.domainsExercised is no longer taken from the model (see
  // buildDebriefPrompt) — it's overwritten here with the same domain set
  // the delta was actually computed from, before this object crosses
  // /api/debrief's response. That's what makes storage (session.
  // domainsExercised in lib/userModel.ts) and the debrief UI
  // (components/Debrief/ExamIntel.tsx) correct for free, with no changes
  // needed in either file — both just consume this object as-is.
  const finalDebrief: DebriefOutput = {
    ...debrief,
    examIntel: { ...debrief.examIntel, domainsExercised: Object.keys(delta) },
  };

  return { debrief: finalDebrief, delta };
}

/**
 * Averages real per-exchange scores into a per-domain delta, grouped by
 * each exchange's validated domainId — replaces the old behavior of
 * broadcasting debrief.scores.overall to every model-claimed exercised
 * domain. See CLAUDE.md, "The Feedback Loop".
 *
 * The validDomainIds filter here is load-bearing, not defense-in-depth:
 * /api/debrief is public/unauthenticated and takes `scenario` straight
 * from the client (see lib/requestSchemas.ts), so a spoofed
 * scenario.targetDomains could otherwise smuggle a non-cert domainId
 * through the enum on makeExchangeAnalysisEntrySchema. This is the actual
 * guarantee that hallucinated domain IDs never reach storage.
 */
export function buildDomainScoreDelta(
  exchangeAnalysis: ExchangeAnalysisEntry[],
  certId: CertId,
): DomainScoreDelta {
  const validDomainIds = new Set(
    (CERT_REGISTRY[certId].domains as readonly { id: string }[]).map((d) => d.id),
  );
  const buckets = new Map<string, number[]>();
  for (const entry of exchangeAnalysis) {
    if (!validDomainIds.has(entry.domainId)) continue;
    const scores = buckets.get(entry.domainId) ?? [];
    scores.push(entry.score);
    buckets.set(entry.domainId, scores);
  }
  const delta: DomainScoreDelta = {};
  for (const [domainId, scores] of buckets) {
    delta[domainId] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }
  return delta;
}
