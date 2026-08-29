// lib/schemas.ts
// One Zod schema per LLM-produced shape. lib/llm.ts parses every model
// response against these before an agent ever sees it — see CLAUDE.md,
// "The LLM Boundary".
import { z } from "zod";

// Everything the Scenario Agent generates. Excludes difficulty,
// counterpartRole, and cert on purpose — those are already known from
// SessionConfig and are read from config, never trusted from model output.
// See CLAUDE.md Hard Invariant #6.
export const GeneratedScenarioSchema = z.object({
  clientName: z.string().min(1),
  clientTitle: z.string().min(1),
  companyName: z.string().min(1),
  industry: z.string().min(1),
  problemStatement: z.string().min(1),
  constraint: z.string().min(1),
  targetDomains: z.array(z.string()).min(1),
  curveball: z.string().min(1),
  tip: z.string().optional(),
  voiceId: z.enum(["af_sarah", "af_bella", "am_adam", "am_michael"]),
});
export type GeneratedScenario = z.infer<typeof GeneratedScenarioSchema>;

// Factory, not a static schema: domainId is constrained by enum to the
// scenario's own targetDomains, not the full cert domain list. This is
// what makes per-exchange domain attribution trustworthy enough to average
// into a real per-domain score in agents/debriefAgent.ts — a hallucinated
// domain can't parse in the first place, rather than being filtered out
// after the fact. See CLAUDE.md, "The Feedback Loop".
export function makeExchangeAnalysisEntrySchema(targetDomains: readonly string[]) {
  return z.object({
    exchangeIndex: z.number().int().nonnegative(),
    domainId: z.enum(targetDomains as [string, ...string[]]),
    score: z.number().min(0).max(100),
    type: z.enum(["good", "incomplete", "missed"]),
    annotation: z.string().min(1),
  });
}
export type ExchangeAnalysisEntry = z.infer<ReturnType<typeof makeExchangeAnalysisEntrySchema>>;

export const DebriefOutputSchema = z.object({
  scores: z.object({
    technicalAccuracy: z.number().min(0).max(100),
    depthOfExplanation: z.number().min(0).max(100),
    domainCoverage: z.number().min(0).max(100),
    communicationClarity: z.number().min(0).max(100),
    overall: z.number().min(0).max(100),
  }),
  moments: z.array(
    z.object({
      exchangeIndex: z.number().int().nonnegative(),
      type: z.enum(["good", "incomplete", "missed"]),
      userMessage: z.string().min(1),
      annotation: z.string().min(1),
      certRelevance: z.string().optional(),
    }),
  ),
  examIntel: z.object({
    // The model is no longer asked to report this (see buildDebriefPrompt) —
    // agents/debriefAgent.ts always overwrites it with a value computed from
    // validated per-exchange domainIds before this ever reaches a caller.
    // .default([]) just keeps parsing lenient if the model includes it anyway.
    domainsExercised: z.array(z.string()).default([]),
    examQuestionExample: z.string(),
    keyConceptsTested: z.array(z.string()),
  }),
  studyNext: z.object({
    weakAreas: z.array(z.string()),
    suggestedTopics: z.array(z.string()),
    suggestedNextScenario: z.string(),
  }),
});
export type DebriefOutput = z.infer<typeof DebriefOutputSchema>;
