import { CERT_REGISTRY, type CertId } from "@/data/domains";
import type { ScenarioOutput } from "@/lib/types";

export function buildExchangeAnalysisPrompt(
  scenario: ScenarioOutput,
  certId: CertId,
  exchangeIndex: number,
  counterpartMessage: string,
  userMessage: string,
): string {
  const certName = CERT_REGISTRY[certId].name;
  return `You are a ${certName} exam coach reviewing one exchange from a mock conversation transcript.

SCENARIO: ${scenario.clientName} (${scenario.clientTitle}) at ${scenario.companyName}
PROBLEM: ${scenario.problemStatement}
TARGET DOMAINS: ${scenario.targetDomains.join(", ")}

${scenario.clientName} said: "${counterpartMessage}"
The candidate replied: "${userMessage}"

TASK: Score this single exchange in isolation. Do not reference any other part of the conversation.

Return ONLY this JSON object — no markdown, no commentary:
{
  "exchangeIndex": ${exchangeIndex},
  "domainId": one of [${scenario.targetDomains.join(", ")}] — whichever target domain this exchange primarily tests,
  "score": number (0-100, how well the user addressed that domain in this message),
  "type": "good" | "incomplete" | "missed",
  "annotation": "string — what was strong, what was missing, and which ${certName} concept this tests"
}

Scoring guide:
- good (70-100): Correct ${certName} approach, explained why, addressed the counterpart's concern
- incomplete (40-69): Correct direction but vague, missing justification, or only partially addressed
- missed (0-39): Wrong service, ignored the question, buzzword-heavy with no substance`;
}

export function buildDebriefPrompt(
  scenario: ScenarioOutput,
  exchangeAnalysis: string,
  certId: CertId,
): string {
  const cert = CERT_REGISTRY[certId];
  const domainList = (cert.domains as readonly { id: string; name: string; weight: number }[])
    .map((d) => `- ${d.id}: ${d.name} (exam weight ${Math.round(d.weight * 100)}%)`)
    .join("\n");

  return `You are a ${cert.name} exam coach producing a final debrief report.

SCENARIO CONTEXT:
- Client: ${scenario.clientName} (${scenario.clientTitle}) at ${scenario.companyName}
- Problem: ${scenario.problemStatement}
- Target domains: ${scenario.targetDomains.join(", ")}

${certId.toUpperCase()} DOMAINS:
${domainList}

EXCHANGE-LEVEL ANALYSIS (use this as your evidence — do not re-derive it from the transcript):
${exchangeAnalysis}

TASK: Synthesize the exchange analysis into a final debrief. Derive scores from the evidence above. Use the raw transcript (provided separately) only to pull exact quotes for "moments".

Return ONLY valid JSON — no markdown, no commentary:
{
  "scores": {
    "technicalAccuracy": number (0-100, weighted average of exchange scores where ${cert.name} correctness was tested),
    "depthOfExplanation": number (0-100, did the user explain WHY, not just WHAT),
    "domainCoverage": number (0-100, how well the target domains were addressed across all exchanges),
    "communicationClarity": number (0-100, was the explanation clear to the counterpart),
    "overall": number (0-100, weighted mean of the four scores above)
  },
  "moments": [
    {
      "exchangeIndex": number,
      "type": "good|incomplete|missed",
      "userMessage": "exact quote from transcript",
      "annotation": "what was good/missing and why",
      "certRelevance": "which ${cert.name} concept this tests (optional)"
    }
  ],
  "examIntel": {
    "examQuestionExample": "A company needs... Which solution? (A)...(B)...(C)...(D)...",
    "keyConceptsTested": ["string"]
  },
  "studyNext": {
    "weakAreas": ["string — cite specific exchange indices as evidence, e.g. 'RBAC least-privilege (exchanges 3, 7 were incomplete)'"],
    "suggestedTopics": ["string"],
    "suggestedNextScenario": "one sentence describing ideal next scenario based on weak areas"
  }
}`;
}
