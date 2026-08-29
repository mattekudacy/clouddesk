// lib/requestSchemas.ts
// Zod schemas for API route *request bodies* — the inbound counterpart to
// lib/schemas.ts, which validates LLM *output*. These endpoints are public
// and unauthenticated; before this file, request bodies were only ever
// type-asserted (`as {...}`), never actually checked, so a malformed or
// adversarial payload could reach an agent's prompt-assembly or array logic
// with no shape guarantee at all.
//
// The literal unions here mirror SessionConfig/Message in lib/types.ts by
// hand — zod can't reflect over a TS type at runtime, so keep them in sync
// if those types change.
import { z } from "zod";
import { CERT_REGISTRY, type CertId } from "@/data/domains";

const CERT_IDS = Object.keys(CERT_REGISTRY) as [CertId, ...CertId[]];

export const SessionConfigSchema = z.object({
  userId: z.string().min(1),
  cert: z.enum(CERT_IDS),
  role: z.enum(["solutions-architect", "senior-developer", "team-lead"]),
  counterpartRole: z.enum(["client", "non-tech", "team-engineer"]),
  difficulty: z.enum(["beginner", "intermediate", "expert"]),
});

export const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const ScenarioContextSchema = z.object({
  domainScores: z.record(z.string(), z.number()),
  seenCombinations: z.array(z.string()),
  attemptedDomainIds: z.array(z.string()),
});

// Mirrors ScenarioOutput: GeneratedScenarioSchema's fields (lib/schemas.ts)
// plus the three config-derived fields the model never generates. A client
// replaying a scenario back to /api/debrief or /api/meeting must round-trip
// the exact shape the scenario API returned.
export const ScenarioOutputRequestSchema = z
  .object({
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
    difficulty: z.enum(["beginner", "intermediate", "expert"]),
    counterpartRole: z.enum(["client", "non-tech", "team-engineer"]),
    cert: z.enum(CERT_IDS),
  })
  // targetDomains can't be checked against a fixed enum above — which IDs
  // are valid depends on the sibling `cert` field. Without this, a client
  // could replay a scenario with a fabricated domain id for the given
  // cert, which would otherwise flow straight into
  // makeExchangeAnalysisEntrySchema's domainId enum in agents/
  // debriefAgent.ts. lib/userModel.ts filters storage as a second layer,
  // but this is the boundary the invalid id should actually be rejected
  // at. See CLAUDE.md, "The Feedback Loop".
  .superRefine((data, ctx) => {
    const validDomainIds = new Set(
      (CERT_REGISTRY[data.cert].domains as readonly { id: string }[]).map((d) => d.id),
    );
    const bad = data.targetDomains.filter((id) => !validDomainIds.has(id));
    if (bad.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetDomains"],
        message: `targetDomains contains IDs not valid for cert "${data.cert}": ${bad.join(", ")}`,
      });
    }
  });

export const ScenarioApiRequestSchema = z.object({
  config: SessionConfigSchema,
  context: ScenarioContextSchema,
});

export const DebriefApiRequestSchema = z.object({
  scenario: ScenarioOutputRequestSchema,
  transcript: z.array(MessageSchema),
});

export const MeetingApiRequestSchema = z.object({
  scenario: ScenarioOutputRequestSchema,
  history: z.array(MessageSchema),
});

// Request body for /api/speech (ElevenLabs TTS proxy — see
// app/api/speech/route.ts and lib/speech.ts). voiceId mirrors
// GeneratedScenarioSchema's enum by hand, same convention as
// ScenarioOutputRequestSchema above.
export const SpeechApiRequestSchema = z.object({
  text: z.string().min(1),
  voiceId: z.enum(["af_sarah", "af_bella", "am_adam", "am_michael"]),
});
