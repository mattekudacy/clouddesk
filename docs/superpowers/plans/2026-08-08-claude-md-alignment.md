# CLAUDE.md Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the shipped app into alignment with the rewritten `CLAUDE.md` — a delta-based feedback loop with a client-side-only orchestrator, a Zod-validated LLM boundary, a config-echo ban, corrected EMA merge math, parallel per-exchange debrief scoring, `localStorage`-backed progress, and the missing failure-behavior and component-rule details.

**Architecture:** `agents/*` become fully pure (no storage, ever) and are called directly from API routes. `agents/orchestrator.ts` flips to a client-side module that calls those API routes via `fetch` and is the sole caller of `updateUserModel`. `debriefAgent` returns `{ debrief, delta }` where `delta` is this session's per-domain observed score, already filtered to the active cert's valid domain IDs. `lib/userModel.ts` merges that delta with a pure, unit-tested EMA function (α = 0.4, first observation raw) and moves its two identity/progress keys from `sessionStorage` to `localStorage`. Every LLM output is parsed against a Zod schema in `lib/llm.ts` before any agent sees it, with one retry on validation failure.

**Tech Stack:** Existing stack (Next.js App Router, TypeScript, Vercel AI SDK + Gemini). Adds `zod` as an explicit dependency (already present transitively) and `vitest` for pure-function unit tests — no existing test runner exists in this repo, so this is new but minimal (`node` environment only, no DOM/browser mocking).

**Decisions locked in before this plan** (confirmed with the user):
1. **Storage:** migrate `lib/userModel.ts`'s two keys (`clouddesk:userModel`, `clouddesk:userId`) to `localStorage` so progress survives closing the browser. All other keys (`clouddesk:config`, `clouddesk:scenario`, `clouddesk:transcript`, `clouddesk:debrief`, `clouddesk:targetContext`) stay in `sessionStorage` — they're single-flow navigation state, not progress.
2. **TTS:** drop Kokoro from `CLAUDE.md`. The app has only ever used the native Web Speech API (`kokoro-js` isn't a dependency); the doc gets corrected to describe what's actually running, no code change.
3. **Role/cert coherence:** resolved at the prompt level — one framing instruction in `buildScenarioPrompt` that reinterprets any of the 3 roles against any cert's domain list. No `CertDefinition` or type changes.

**Explicitly deferred (not in this plan, flagged so it isn't silently dropped):** `CLAUDE.md`'s "Scenario generation fails → block on the brief screen with a retry" assumes scenario generation happens *after* navigating to `/brief`. The app generates *before* navigating (blocking on `/` with an inline retry instead) — functionally equivalent failure visibility, different screen. Re-plumbing that navigation order is a UX change nobody asked for; left alone. Also deferred: `CLAUDE.md`'s "Open Decisions" #3 (grader consistency — fixture transcripts scored 3× with an asserted spread) is a measurement task, not a code-alignment one.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `package.json` | Modify | Add `zod` (explicit), `vitest` (dev), `test` script |
| `vitest.config.ts` | Create | Node-environment test config |
| `lib/scoreMerge.ts` | Create | Pure EMA merge function |
| `lib/scoreMerge.test.ts` | Create | Unit tests for the merge function |
| `lib/schemas.ts` | Create | Zod schemas for every LLM-produced shape |
| `lib/types.ts` | Modify | `ScenarioOutput`/`DebriefOutput` derive from schemas; add `DomainScoreDelta` |
| `lib/llm.ts` | Modify | Add `callLLMJSON`, `callLLMWithToolsJSON` (schema validation + one retry) |
| `prompts/scenarioAgent.ts` | Modify | Stop asking the model to echo `difficulty`/`counterpartRole`/`cert`; add role↔cert framing |
| `agents/scenarioAgent.ts` | Modify | Use `callLLMWithToolsJSON`; merge config fields in after parsing |
| `prompts/debriefAgent.ts` | Modify | Score one exchange per call instead of the whole transcript in one call |
| `agents/debriefAgent.ts` | Modify | Pure (no storage import); `Promise.all` over exchanges; returns `{ debrief, delta }` |
| `lib/userModel.ts` | Modify | `localStorage` migration, `getUserId`, EMA merge via `scoreMerge`, export/import/reset |
| `agents/orchestrator.ts` | Modify | Client-side `fetch` wrapper; sole caller of `updateUserModel` |
| `app/api/scenario/route.ts` | Modify | Call `scenarioAgent` directly, not via orchestrator |
| `app/api/debrief/route.ts` | Modify | Call `debriefAgent` directly; return `{ debrief, delta }` |
| `app/page.tsx` | Modify | Use `getUserId`/`readUserModel`/`orchestrator.startSession`; compute loop-transparency context |
| `app/brief/page.tsx` | Modify | Read and pass through `targetContext` |
| `components/Brief/BriefCard.tsx` | Modify | Render "why this scenario" line |
| `components/MeetingRoom/InputBar.tsx` | Modify | Accept `restoreText` prop |
| `app/meeting/page.tsx` | Modify | Preserve typed message + inline retry on turn failure |
| `app/debrief/page.tsx` | Modify | Use `orchestrator.finishSession`; retry against in-memory transcript |
| `app/dashboard/page.tsx` | Modify | Cert switcher + export/import/reset controls |
| `CLAUDE.md` | Modify | Fix `lib/certs.ts` → `data/domains/index.ts`; drop Kokoro; resolve role/cert coherence note |

---

## Task 1: Branch and test scaffold

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create a feature branch**

```bash
cd /Users/cmante/Documents/root/clouddesk
git checkout -b claude-md-alignment
```

- [ ] **Step 2: Install vitest and add zod as an explicit dependency**

```bash
npm install --save-dev vitest
npm install zod@^4.4.3
```

- [ ] **Step 3: Add a `test` script to `package.json`**

Open `package.json`. In `"scripts"`, add:

```json
    "test": "vitest run"
```

so the `scripts` block reads:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  },
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 5: Verify vitest runs (no tests yet)**

Run: `npm test`
Expected: `No test files found` — vitest is wired up, nothing to run yet.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest and explicit zod dependency"
```

---

## Task 2: Pure EMA merge function (TDD)

**Files:**
- Create: `lib/scoreMerge.ts`
- Test: `lib/scoreMerge.test.ts`

This is the fix for the α=0.3 bug and the "first observation taken raw" rule from `CLAUDE.md`'s Feedback Loop section — pulled out as a pure function so it's testable without touching storage.

- [ ] **Step 1: Write the failing test**

Create `lib/scoreMerge.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mergeDomainScore } from "./scoreMerge";

describe("mergeDomainScore", () => {
  it("takes the first observation raw, ignoring the seeded previous score", () => {
    expect(mergeDomainScore(50, 90, false)).toBe(90);
  });

  it("blends with alpha = 0.4 on subsequent observations", () => {
    // 60 * 0.6 + 90 * 0.4 = 36 + 36 = 72
    expect(mergeDomainScore(60, 90, true)).toBe(72);
  });

  it("rounds to the nearest integer", () => {
    // 55 * 0.6 + 70 * 0.4 = 33 + 28 = 61
    expect(mergeDomainScore(55, 70, true)).toBe(61);
  });

  it("pulls a low new score down as fast as it pulls a high one up", () => {
    // 80 * 0.6 + 20 * 0.4 = 48 + 8 = 56
    expect(mergeDomainScore(80, 20, true)).toBe(56);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/scoreMerge.test.ts`
Expected: FAIL — `Cannot find module './scoreMerge'`

- [ ] **Step 3: Write the implementation**

Create `lib/scoreMerge.ts`:

```typescript
// lib/scoreMerge.ts
// Pure merge function for rolling per-domain scores. Kept separate from
// lib/userModel.ts so it's unit-testable without touching storage.

const ALPHA = 0.4;

/**
 * Blends a domain's stored score with this session's observed score.
 * First observation is taken raw (no blending against the seeded default) —
 * otherwise an exponential moving average with alpha = 0.4, so recent
 * sessions dominate. See CLAUDE.md, "The Feedback Loop".
 */
export function mergeDomainScore(
  previousScore: number,
  sessionScore: number,
  hasPriorAttempt: boolean,
): number {
  if (!hasPriorAttempt) return Math.round(sessionScore);
  return Math.round(previousScore * (1 - ALPHA) + sessionScore * ALPHA);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/scoreMerge.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add lib/scoreMerge.ts lib/scoreMerge.test.ts
git commit -m "feat: add pure EMA merge function for domain scores (alpha=0.4)"
```

---

## Task 3: Zod schemas for the LLM boundary

**Files:**
- Create: `lib/schemas.ts`

`CLAUDE.md` Hard Invariant #5: nothing crosses the LLM boundary unvalidated. This defines one schema per LLM-produced shape. `GeneratedScenarioSchema` deliberately excludes `difficulty`, `counterpartRole`, and `cert` — those are Hard Invariant #6: the model never echoes config back.

- [ ] **Step 1: Create `lib/schemas.ts`**

```typescript
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

export const ExchangeAnalysisEntrySchema = z.object({
  exchangeIndex: z.number().int().nonnegative(),
  score: z.number().min(0).max(100),
  type: z.enum(["good", "incomplete", "missed"]),
  annotation: z.string().min(1),
});
export type ExchangeAnalysisEntry = z.infer<typeof ExchangeAnalysisEntrySchema>;

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
      userMessage: z.string(),
      annotation: z.string(),
      certRelevance: z.string().optional(),
    }),
  ),
  examIntel: z.object({
    domainsExercised: z.array(z.string()),
    examQuestionExample: z.string(),
    keyConceptsTested: z.array(z.string()),
  }),
  studyNext: z.object({
    weakAreas: z.array(z.string()),
    suggestedTopics: z.array(z.string()),
    suggestedNextScenario: z.string(),
  }),
});
```

- [ ] **Step 2: Write a smoke test for the schemas**

Create `lib/schemas.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { GeneratedScenarioSchema, ExchangeAnalysisEntrySchema, DebriefOutputSchema } from "./schemas";

describe("GeneratedScenarioSchema", () => {
  it("accepts a well-formed scenario with no config fields", () => {
    const result = GeneratedScenarioSchema.safeParse({
      clientName: "Priya Shah",
      clientTitle: "Operations Director",
      companyName: "Northwind Traders",
      industry: "Logistics",
      problemStatement: "Our warehouse system keeps losing track of inventory during peak season.",
      constraint: "Must not require new hires to run it.",
      targetDomains: ["identities"],
      curveball: "A regional office suddenly needs read-only access.",
      voiceId: "af_sarah",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a scenario that echoes difficulty back", () => {
    // difficulty is not part of the schema — an extra field with the wrong
    // shape for something else in the payload should still fail on its own
    // missing/invalid required fields, not silently pass extras through.
    const result = GeneratedScenarioSchema.safeParse({
      clientTitle: "Operations Director",
      companyName: "Northwind Traders",
      industry: "Logistics",
      problemStatement: "text",
      constraint: "text",
      targetDomains: ["identities"],
      curveball: "text",
      voiceId: "af_sarah",
      difficulty: "beginner",
    });
    expect(result.success).toBe(false); // missing required clientName
  });

  it("rejects an unknown voiceId", () => {
    const result = GeneratedScenarioSchema.safeParse({
      clientName: "Priya Shah",
      clientTitle: "Operations Director",
      companyName: "Northwind Traders",
      industry: "Logistics",
      problemStatement: "text",
      constraint: "text",
      targetDomains: ["identities"],
      curveball: "text",
      voiceId: "en_robot",
    });
    expect(result.success).toBe(false);
  });
});

describe("ExchangeAnalysisEntrySchema", () => {
  it("rejects a score outside 0-100", () => {
    const result = ExchangeAnalysisEntrySchema.safeParse({
      exchangeIndex: 0,
      score: 150,
      type: "good",
      annotation: "text",
    });
    expect(result.success).toBe(false);
  });
});

describe("DebriefOutputSchema", () => {
  it("accepts a well-formed debrief", () => {
    const result = DebriefOutputSchema.safeParse({
      scores: { technicalAccuracy: 80, depthOfExplanation: 70, domainCoverage: 75, communicationClarity: 85, overall: 78 },
      moments: [{ exchangeIndex: 0, type: "good", userMessage: "text", annotation: "text" }],
      examIntel: { domainsExercised: ["identities"], examQuestionExample: "text", keyConceptsTested: ["text"] },
      studyNext: { weakAreas: ["text"], suggestedTopics: ["text"], suggestedNextScenario: "text" },
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- lib/schemas.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 4: Commit**

```bash
git add lib/schemas.ts lib/schemas.test.ts
git commit -m "feat: add Zod schemas for every LLM-produced shape"
```

---

## Task 4: Update `lib/types.ts` to derive from the schemas

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Read the current file**

Read `lib/types.ts` to confirm current content before editing.

- [ ] **Step 2: Replace the entire file**

```typescript
import type { CertId } from "@/data/domains";
import type { z } from "zod";
import type { GeneratedScenarioSchema, DebriefOutputSchema } from "./schemas";

export type Message = { role: "user" | "assistant"; content: string };
export type LLMOpts = { temperature?: number; json?: boolean };

export type SessionConfig = {
  userId: string;
  cert: CertId;
  role: "solutions-architect" | "senior-developer" | "team-lead";
  counterpartRole: "client" | "non-tech" | "junior-dev" | "team-engineer";
  difficulty: "beginner" | "intermediate" | "expert";
};

// Everything the model generates, plus the config fields it never gets to
// invent. difficulty, counterpartRole, and cert always come from
// SessionConfig — see CLAUDE.md Hard Invariant #6.
export type ScenarioOutput = z.infer<typeof GeneratedScenarioSchema> & {
  difficulty: SessionConfig["difficulty"];
  counterpartRole: SessionConfig["counterpartRole"];
  cert: CertId;
};

export type DebriefOutput = z.infer<typeof DebriefOutputSchema>;

// This session's observed score per domain, already filtered to domain IDs
// valid for the active cert. debriefAgent computes and returns it; nothing
// else invents one. See CLAUDE.md, "The Feedback Loop".
export type DomainScoreDelta = Record<string, number>;

export type SessionResult = {
  sessionId: string;
  date: number;
  scenario: ScenarioOutput;
  scores: DebriefOutput["scores"];
  domainsExercised: string[];
};

export type CertProgress = {
  domainScores: Record<string, number>;
  sessions: SessionResult[];
  seenCombinations: string[];
};

export type UserModel = {
  userId: string;
  certs: Partial<Record<CertId, CertProgress>>;
};
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: errors in `lib/llm.ts`, `agents/scenarioAgent.ts`, `agents/debriefAgent.ts`, `lib/userModel.ts`, `agents/orchestrator.ts`, and the API routes — all fixed in later tasks. No errors anywhere else.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat: derive ScenarioOutput/DebriefOutput from Zod schemas, add DomainScoreDelta"
```

---

## Task 5: Add schema-validating LLM calls to `lib/llm.ts`

**Files:**
- Modify: `lib/llm.ts`

Adds `callLLMJSON` and `callLLMWithToolsJSON` — both parse the model's response against a Zod schema and retry once with the validation error appended to the prompt before failing loudly. `callLLM` and `callLLMWithTools` (raw-string) stay, since `meetingAgent` needs plain text, not JSON.

- [ ] **Step 1: Read the current file**

Read `lib/llm.ts` to confirm current content before editing.

- [ ] **Step 2: Replace the entire file**

```typescript
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs } from "ai";
import type { z } from "zod";
import type { Message, LLMOpts, CertProgress } from "./types";
import { buildScenarioTools } from "./tools";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const MODEL = google("gemini-2.5-flash");

function toAIMessages(messages: Message[]) {
  const msgs = messages.length > 0 ? messages : [{ role: "user" as const, content: "Begin." }];
  return msgs.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

// opts.json is intentional dead code — JSON output is enforced via prompt, not API flag
export async function callLLM(
  systemPrompt: string,
  messages: Message[],
  opts: LLMOpts = {},
): Promise<string> {
  const { text } = await generateText({
    model: MODEL,
    system: systemPrompt,
    messages: toAIMessages(messages),
    temperature: opts.temperature ?? 0.8,
  });
  return text;
}

export async function callLLMWithTools(
  systemPrompt: string,
  messages: Message[],
  certProgress: CertProgress,
  opts: LLMOpts = {},
): Promise<string> {
  const tools = buildScenarioTools(certProgress);
  const { text } = await generateText({
    model: MODEL,
    system: systemPrompt,
    messages: toAIMessages(messages),
    tools,
    stopWhen: stepCountIs(4),
    temperature: opts.temperature ?? 0.8,
  });
  return text;
}

// Shared retry loop: call the model, strip fences, parse JSON, validate
// against `schema`. On failure, retry once with the validation error
// appended to the prompt; fail loudly on the second miss. Never coerce,
// never fill defaults, never return partial output. See CLAUDE.md,
// "The LLM Boundary".
async function parseWithRetry<T>(
  schema: z.ZodType<T>,
  call: (prompt: string) => Promise<string>,
  systemPrompt: string,
): Promise<T> {
  let lastRaw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? systemPrompt
        : `${systemPrompt}\n\nYour previous response failed validation:\n${lastRaw}\n\nFix it and return ONLY valid JSON matching the required shape.`;

    const raw = await call(prompt);
    lastRaw = raw;

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch {
      continue;
    }

    const result = schema.safeParse(parsed);
    if (result.success) return result.data;
    lastRaw = `${raw}\n\nValidation errors: ${result.error.message}`;
  }
  throw new Error(
    `callLLMJSON: response failed schema validation after 2 attempts. Last raw: ${lastRaw.slice(0, 500)}`,
  );
}

export async function callLLMJSON<T>(
  schema: z.ZodType<T>,
  systemPrompt: string,
  messages: Message[],
  opts: LLMOpts = {},
): Promise<T> {
  return parseWithRetry(schema, (prompt) => callLLM(prompt, messages, opts), systemPrompt);
}

export async function callLLMWithToolsJSON<T>(
  schema: z.ZodType<T>,
  systemPrompt: string,
  messages: Message[],
  certProgress: CertProgress,
  opts: LLMOpts = {},
): Promise<T> {
  return parseWithRetry(
    schema,
    (prompt) => callLLMWithTools(prompt, messages, certProgress, opts),
    systemPrompt,
  );
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: same cascade errors as Task 4, minus anything in `lib/llm.ts` itself.

- [ ] **Step 4: Commit**

```bash
git add lib/llm.ts
git commit -m "feat: add callLLMJSON/callLLMWithToolsJSON with schema validation and one retry"
```

---

## Task 6: Stop echoing config in the scenario prompt; resolve role/cert coherence

**Files:**
- Modify: `prompts/scenarioAgent.ts`

- [ ] **Step 1: Read the current file**

Read `prompts/scenarioAgent.ts` to confirm current content before editing.

- [ ] **Step 2: Replace the entire file**

```typescript
import { CERT_REGISTRY, type CertId } from "@/data/domains";
import type { SessionConfig } from "@/lib/types";

const ROLE_DEFINITIONS: Record<SessionConfig["role"], string> = {
  "solutions-architect":
    "The user is a Solutions Architect who designs end-to-end cloud systems. They are expected to reason about scalability, reliability, security patterns, and cost trade-offs at a high level. Scenarios should involve architectural decisions — why this service over that one, what are the failure modes, how does the system behave at scale. Do NOT focus on implementation detail.",
  "senior-developer":
    "The user is a Senior Developer with deep implementation knowledge. They are expected to know specific APIs, SDKs, deployment patterns, CI/CD, and debugging approaches. Scenarios should be hands-on — how would you actually build this, what would break, how would you test it. Focus on implementation depth, not high-level architecture.",
  "team-lead":
    "The user is a Team Lead who bridges technical and organizational concerns. They are expected to justify architectural decisions to both engineers and stakeholders, manage technical debt trade-offs, and explain the 'why' behind design choices. Scenarios should involve defending decisions and communicating constraints to different audiences.",
};

const COUNTERPART_DEFINITIONS: Record<SessionConfig["counterpartRole"], string> = {
  client:
    "The counterpart is a business stakeholder with partial technical understanding. They ask outcome-focused questions and push on timelines, costs, and risk. They do not need service-level detail but expect clear reasoning and business justification.",
  "non-tech":
    "The counterpart is a curious, intelligent layperson with no cloud or technical background. They ask 'but what does that actually mean?' and 'can you explain that without the jargon?' They challenge the user to communicate simply and clearly.",
  "junior-dev":
    "The counterpart is a junior developer who is eager to learn but uncertain. They ask 'why' questions, admit confusion, and defer to the user's expertise. They want to understand reasoning, not just what to do, and will keep asking for clarification.",
  "team-engineer":
    "The counterpart is a capable senior engineer who understands the tech and pushes back. They suggest alternatives, challenge design decisions technically, and will not accept vague answers.",
};

export function buildScenarioPrompt(
  role: SessionConfig["role"],
  counterpartRole: SessionConfig["counterpartRole"],
  certId: CertId,
): string {
  const cert = CERT_REGISTRY[certId];
  const domainList = (
    cert.domains as readonly {
      id: string;
      name: string;
      keyServices: readonly string[];
      concepts: readonly string[];
    }[]
  )
    .map(
      (d) =>
        `- ${d.id}: ${d.name} (key services: ${d.keyServices.join(", ")}; concepts: ${d.concepts.join(", ")})`
    )
    .join("\n");

  return `You are a scenario generator for ${cert.name} (${certId.toUpperCase()}) exam prep.

USER ROLE: ${ROLE_DEFINITIONS[role]}

COUNTERPART: ${COUNTERPART_DEFINITIONS[counterpartRole]}

CALIBRATING THE ROLE TO THIS CERT: the role above is generic across every cert CloudDesk supports, but ${cert.name} is not a generic exam — reinterpret the role through what someone actually does on this exam. A Solutions Architect studying an administrator-focused cert (like AZ-104) should still get architectural-decision framing, but the decisions must be ones an administrator actually makes — subscription structure, RBAC boundaries, network topology — not generic multi-region system design. A Solutions Architect studying a network-focused cert (like AZ-700) should get framing around connectivity and routing decisions, not compute or storage architecture. Never force the role into a scenario shape this cert's domain list doesn't support.

You have access to three tools. Use them in this order:
1. Call readDomainScores — identify the domain with the lowest score (that is the weakest domain)
2. Call listSeenCombinations — note which industry:problem combinations to avoid
3. Generate a scenario JSON targeting the weakest domain, calibrated for the user role and counterpart above
4. Call validateScenario — pass your targetDomains, problemStatement, and the weakest domain ID
5. If validateScenario returns valid: false, fix the issue and call validateScenario again
6. Once validateScenario returns valid: true, output the final scenario JSON

SCENARIO RULES:
- Return ONLY valid JSON matching the schema below — no markdown, no commentary
- Do NOT include difficulty, counterpartRole, or cert in your JSON — those are already fixed by the session and are not yours to generate
- The problemStatement describes the situation from the COUNTERPART's perspective — what they need or don't understand
- Never mention Azure services or technical solutions in problemStatement
- The curveball is a mid-conversation complication; keep it in character for the counterpart
- The industry and problem must NOT match any previously seen combination
- targetDomains must include the weakest domain and may include 1–2 others
- voiceId must be one of: af_sarah, af_bella, am_adam, am_michael
- clientName and clientTitle should be appropriate for the counterpart type:
  - client: business stakeholder name and title at a company
  - non-tech: a person with a non-technical title (e.g. "Writer", "Teacher", "Product Manager")
  - junior-dev: a junior developer name and title at a company
  - team-engineer: a senior/staff engineer name and title at a company

This session is for a ${counterpartRole} counterpart (already fixed — do not vary it).

${certId.toUpperCase()} DOMAINS:
${domainList}

Return this exact JSON shape:
{
  "clientName": "string",
  "clientTitle": "string",
  "companyName": "string",
  "industry": "string",
  "problemStatement": "string (2-3 sentences from the counterpart's perspective — no Azure service names)",
  "constraint": "string (one constraint relevant to the counterpart type)",
  "targetDomains": ["string — domain IDs"],
  "curveball": "string (one sentence complication in character for the counterpart)",
  "tip": "string (beginner only — one actionable hint) or omit the field entirely if not applicable",
  "voiceId": "af_sarah|af_bella|am_adam|am_michael"
}`;
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: same cascade errors as before (agents/scenarioAgent.ts still calls the old JSON.parse path — fixed next task).

- [ ] **Step 4: Commit**

```bash
git add prompts/scenarioAgent.ts
git commit -m "feat: scenario prompt stops asking for config echo, adds role-cert framing"
```

---

## Task 7: Scenario Agent uses schema validation and merges config after parsing

**Files:**
- Modify: `agents/scenarioAgent.ts`

- [ ] **Step 1: Read the current file**

Read `agents/scenarioAgent.ts` to confirm current content before editing.

- [ ] **Step 2: Replace the entire file**

```typescript
import { callLLMWithToolsJSON } from "@/lib/llm";
import { buildScenarioPrompt } from "@/prompts/scenarioAgent";
import { getCertProgress } from "@/lib/userModel";
import { GeneratedScenarioSchema } from "@/lib/schemas";
import type { ScenarioOutput, SessionConfig, UserModel } from "@/lib/types";

export async function scenarioAgent(
  config: SessionConfig,
  userModel: UserModel,
): Promise<ScenarioOutput> {
  const certProgress = getCertProgress(userModel, config.cert);
  const systemPrompt = buildScenarioPrompt(config.role, config.counterpartRole, config.cert);

  const generated = await callLLMWithToolsJSON(
    GeneratedScenarioSchema,
    systemPrompt,
    [{
      role: "user",
      content: `Generate a ${config.difficulty} scenario for a ${config.role} talking to a ${config.counterpartRole}.`,
    }],
    certProgress,
    { temperature: 0.9 },
  );

  // difficulty, counterpartRole, and cert are never trusted from the model —
  // they're already known from config. See CLAUDE.md Hard Invariant #6.
  return {
    ...generated,
    difficulty: config.difficulty,
    counterpartRole: config.counterpartRole,
    cert: config.cert,
  };
}
```

Note: `getCertProgress` is a pure projection over the `UserModel` already passed in as a parameter — it doesn't read browser storage itself, so importing it here doesn't violate "agents never touch storage" (Hard Invariant #2). Only `readUserModel`/`updateUserModel` in `lib/userModel.ts` actually touch `localStorage`.

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: errors remaining only in `agents/debriefAgent.ts`, `lib/userModel.ts`, `agents/orchestrator.ts`, and the two API routes.

- [ ] **Step 4: Commit**

```bash
git add agents/scenarioAgent.ts
git commit -m "feat: scenarioAgent validates via schema, merges config fields after parsing"
```

---

## Task 8: Debrief prompt scores one exchange per call

**Files:**
- Modify: `prompts/debriefAgent.ts`

- [ ] **Step 1: Read the current file**

Read `prompts/debriefAgent.ts` to confirm current content before editing.

- [ ] **Step 2: Replace `buildExchangeAnalysisPrompt`**

Replace the entire file:

```typescript
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
  "score": number (0-100, how well the user addressed the scenario domain in this message),
  "type": "good" | "incomplete" | "missed",
  "annotation": "string — what was strong, what was missing, and which ${certName} concept this tests"
}

Scoring guide:
- good (70-100): Correct Azure approach, explained why, addressed the counterpart's concern
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
    "technicalAccuracy": number (0-100, weighted average of exchange scores where Azure correctness was tested),
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
    "domainsExercised": ["domain IDs from the ${certId.toUpperCase()} domain list above"],
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
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: `agents/debriefAgent.ts` now errors — its calls to `buildExchangeAnalysisPrompt` use the old signature. Fixed next task.

- [ ] **Step 4: Commit**

```bash
git add prompts/debriefAgent.ts
git commit -m "feat: debrief prompt scores one exchange per call instead of the whole transcript"
```

---

## Task 9: Debrief Agent becomes pure, scores in parallel, returns a delta

**Files:**
- Modify: `agents/debriefAgent.ts`

This is the biggest single fix: removes the `updateUserModel` import (Hard Invariant #2 — agents never touch storage), parallelizes per-exchange scoring with `Promise.all` (CLAUDE.md, Agent Contracts), and returns `{ debrief, delta }` where `delta` drops any domain ID not valid for the cert before it ever reaches storage.

- [ ] **Step 1: Read the current file**

Read `agents/debriefAgent.ts` to confirm current content before editing.

- [ ] **Step 2: Replace the entire file**

```typescript
import { callLLMJSON } from "@/lib/llm";
import { buildExchangeAnalysisPrompt, buildDebriefPrompt } from "@/prompts/debriefAgent";
import { ExchangeAnalysisEntrySchema, DebriefOutputSchema } from "@/lib/schemas";
import { CERT_REGISTRY } from "@/data/domains";
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

  // Each exchange scores independently by design, so Promise.all is
  // correct — the sequential version is the longest operation in the app,
  // running against a serverless function timeout on a 15-exchange
  // transcript. See CLAUDE.md, Agent Contracts.
  const exchangeAnalysis = await Promise.all(
    exchanges.map((exchange) =>
      callLLMJSON(
        ExchangeAnalysisEntrySchema,
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

  return { debrief, delta: buildDomainScoreDelta(debrief, scenario.cert) };
}

function buildDomainScoreDelta(debrief: DebriefOutput, certId: ScenarioOutput["cert"]): DomainScoreDelta {
  const validDomainIds = new Set(
    (CERT_REGISTRY[certId].domains as readonly { id: string }[]).map((d) => d.id),
  );
  const delta: DomainScoreDelta = {};
  for (const domainId of debrief.examIntel.domainsExercised) {
    // Hallucinated domain IDs never reach storage. See CLAUDE.md,
    // "The Feedback Loop".
    if (validDomainIds.has(domainId)) {
      delta[domainId] = debrief.scores.overall;
    }
  }
  return delta;
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: errors remaining only in `lib/userModel.ts`, `agents/orchestrator.ts`, `app/api/debrief/route.ts`, `app/api/scenario/route.ts`, `app/debrief/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add agents/debriefAgent.ts
git commit -m "feat: debriefAgent is pure, scores exchanges in parallel, returns a domain delta"
```

---

## Task 10: `lib/userModel.ts` — localStorage migration, correct EMA merge, export/import/reset

**Files:**
- Modify: `lib/userModel.ts`

- [ ] **Step 1: Read the current file**

Read `lib/userModel.ts` to confirm current content before editing.

- [ ] **Step 2: Replace the entire file**

```typescript
// lib/userModel.ts
import { CERT_REGISTRY, type CertId } from "@/data/domains";
import { mergeDomainScore } from "./scoreMerge";
import type { UserModel, CertProgress, SessionResult, ScenarioOutput, DebriefOutput, DomainScoreDelta } from "./types";

const MODEL_KEY = "clouddesk:userModel";
const USER_ID_KEY = "clouddesk:userId";

// User identity and progress persist in localStorage — they're meant to
// survive closing the browser. In-flight session state (config, scenario,
// transcript, the current debrief) stays in sessionStorage; see the page
// components under app/. See CLAUDE.md, Stack and Environment.

export function getUserId(): string {
  if (typeof window === "undefined") return "user";
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;
  const generated = `user-${Date.now()}`;
  localStorage.setItem(USER_ID_KEY, generated);
  return generated;
}

function initCertProgress(certId: CertId): CertProgress {
  const domains = CERT_REGISTRY[certId].domains as readonly { id: string }[];
  const domainScores = Object.fromEntries(domains.map((d) => [d.id, 50]));
  return { domainScores, sessions: [], seenCombinations: [] };
}

export function readUserModel(userId: string): UserModel {
  if (typeof window === "undefined") {
    return { userId, certs: {} };
  }
  const raw = localStorage.getItem(MODEL_KEY);
  if (!raw) {
    return { userId, certs: {} };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { userId, certs: {} };
  }
  // Stale-data guard: v1 model had domainScores at top level, not certs
  if (!parsed.certs || typeof parsed.certs !== "object") {
    return { userId, certs: {} };
  }
  return parsed as UserModel;
}

export function getCertProgress(userModel: UserModel, certId: CertId): CertProgress {
  return userModel.certs[certId] ?? initCertProgress(certId);
}

/**
 * Applies this session's debrief to the stored user model: merges the
 * per-domain delta (EMA, alpha = 0.4, first observation raw) and appends
 * the session to history. The only caller is agents/orchestrator.ts,
 * client-side, after the debrief API response lands. See CLAUDE.md, Hard
 * Invariant #3 and "The Feedback Loop".
 */
export function updateUserModel(
  certId: CertId,
  scenario: ScenarioOutput,
  debrief: DebriefOutput,
  delta: DomainScoreDelta,
): void {
  if (typeof window === "undefined") return;
  const userId = getUserId();
  const model = readUserModel(userId);
  const certProgress = getCertProgress(model, certId);

  for (const [domainId, sessionScore] of Object.entries(delta)) {
    if (!(domainId in certProgress.domainScores)) continue; // defense in depth — delta is already filtered upstream
    const hasPriorAttempt = certProgress.sessions.some((s) => s.domainsExercised.includes(domainId));
    certProgress.domainScores[domainId] = mergeDomainScore(
      certProgress.domainScores[domainId],
      sessionScore,
      hasPriorAttempt,
    );
  }

  const session: SessionResult = {
    sessionId: `${userId}-${Date.now()}`,
    date: Date.now(),
    scenario,
    scores: debrief.scores,
    domainsExercised: debrief.examIntel.domainsExercised,
  };
  certProgress.sessions.push(session);

  const combo = `${scenario.industry}:${scenario.problemStatement.slice(0, 40)}`;
  if (!certProgress.seenCombinations.includes(combo)) {
    certProgress.seenCombinations.push(combo);
  }

  model.userId = userId;
  model.certs[certId] = certProgress;
  localStorage.setItem(MODEL_KEY, JSON.stringify(model));
}

export function pickWeakestDomain(certProgress: CertProgress): string {
  const scores = certProgress.domainScores;
  return (Object.entries(scores) as [string, number][]).sort(
    (a, b) => a[1] - b[1],
  )[0][0];
}

/** Serializes the full user model for the dashboard's export control. */
export function exportUserModel(userId: string): string {
  return JSON.stringify(readUserModel(userId), null, 2);
}

/**
 * Replaces the stored user model from an exported JSON string. Throws on
 * malformed input so the dashboard can show the error rather than silently
 * discarding existing progress.
 */
export function importUserModel(raw: string): UserModel {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed.certs || typeof parsed.certs !== "object" || typeof parsed.userId !== "string") {
    throw new Error("File does not look like a CloudDesk user model export.");
  }
  const model = parsed as UserModel;
  localStorage.setItem(MODEL_KEY, JSON.stringify(model));
  localStorage.setItem(USER_ID_KEY, model.userId);
  return model;
}

/** Clears all stored progress. Used by the dashboard's reset control. */
export function resetUserModel(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(MODEL_KEY);
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: errors remaining only in `agents/orchestrator.ts`, `app/api/debrief/route.ts`, `app/api/scenario/route.ts`, `app/page.tsx`, `app/debrief/page.tsx`, `app/dashboard/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add lib/userModel.ts
git commit -m "feat: migrate userModel to localStorage, fix EMA merge to alpha=0.4, add export/import/reset"
```

---

## Task 11: Orchestrator flips to a client-side fetch wrapper

**Files:**
- Modify: `agents/orchestrator.ts`

This is the fix for Hard Invariant #3. `orchestrator.ts` no longer imports agent functions directly (that would run it server-side, inside the caller's bundle) — it calls the API routes over `fetch` and is the only place that calls `updateUserModel`.

- [ ] **Step 1: Read the current file**

Read `agents/orchestrator.ts` to confirm current content before editing.

- [ ] **Step 2: Replace the entire file**

```typescript
// agents/orchestrator.ts
// The single seam where pure agents meet browser storage. Runs client-side
// only — every export here calls an API route over fetch, never an agent
// directly, and this is the only file that calls updateUserModel. See
// CLAUDE.md Hard Invariant #3.
import { updateUserModel } from "@/lib/userModel";
import type { ScenarioOutput, Message, SessionConfig, DebriefOutput, UserModel, DomainScoreDelta } from "@/lib/types";

export async function startSession(
  config: SessionConfig,
  userModel: UserModel,
): Promise<ScenarioOutput> {
  const res = await fetch("/api/scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config, userModel }),
  });
  if (!res.ok) throw new Error(`Scenario API error: ${res.status}`);
  return res.json();
}

export async function finishSession(
  scenario: ScenarioOutput,
  transcript: Message[],
): Promise<DebriefOutput> {
  const res = await fetch("/api/debrief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario, transcript }),
  });
  if (!res.ok) throw new Error(`Debrief API error: ${res.status}`);
  const { debrief, delta } = (await res.json()) as { debrief: DebriefOutput; delta: DomainScoreDelta };

  try {
    updateUserModel(scenario.cert, scenario, debrief, delta);
  } catch (err) {
    // The user's grade is never contingent on bookkeeping — show the
    // debrief anyway. See CLAUDE.md, "The Feedback Loop".
    console.error("finishSession: failed to update user model:", err);
  }

  return debrief;
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: errors remaining only in the two API routes and the three page components.

- [ ] **Step 4: Commit**

```bash
git add agents/orchestrator.ts
git commit -m "feat: orchestrator becomes client-side fetch wrapper, sole caller of updateUserModel"
```

---

## Task 12: API routes call agents directly, not through the orchestrator

**Files:**
- Modify: `app/api/scenario/route.ts`
- Modify: `app/api/debrief/route.ts`

- [ ] **Step 1: Replace `app/api/scenario/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { scenarioAgent } from "@/agents/scenarioAgent";
import type { SessionConfig, UserModel } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { config, userModel } = (await req.json()) as {
      config: SessionConfig;
      userModel: UserModel;
    };
    if (!config || !userModel) {
      return NextResponse.json({ error: "Missing config or userModel" }, { status: 400 });
    }
    const scenario = await scenarioAgent(config, userModel);
    return NextResponse.json(scenario);
  } catch (err) {
    console.error("scenario route error:", err);
    return NextResponse.json({ error: "Failed to generate scenario" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Replace `app/api/debrief/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { debriefAgent } from "@/agents/debriefAgent";
import type { ScenarioOutput, Message } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { scenario, transcript } = (await req.json()) as {
      scenario: ScenarioOutput;
      transcript: Message[];
    };
    if (!scenario || !transcript) {
      return NextResponse.json({ error: "Missing scenario or transcript" }, { status: 400 });
    }
    const { debrief, delta } = await debriefAgent(transcript, scenario);
    return NextResponse.json({ debrief, delta });
  } catch (err) {
    console.error("debrief route error:", err);
    return NextResponse.json({ error: "Failed to generate debrief" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: errors remaining only in `app/page.tsx`, `app/debrief/page.tsx`, `app/dashboard/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/api/scenario/route.ts app/api/debrief/route.ts
git commit -m "feat: API routes call agents directly instead of the (now client-only) orchestrator"
```

---

## Task 13: Setup page uses the storage helpers and orchestrator; computes loop-transparency context

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Read the current file**

Read `app/page.tsx` to confirm current content before editing.

- [ ] **Step 2: Replace the `startSession` function and its imports**

Find the import block at the top of the file:

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CERT_REGISTRY, type CertId } from "@/data/domains";
import type { SessionConfig, UserModel } from "@/lib/types";
```

Replace it with:

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CERT_REGISTRY, getDomainName, type CertId } from "@/data/domains";
import { getUserId, readUserModel, getCertProgress } from "@/lib/userModel";
import { startSession as generateScenario } from "@/agents/orchestrator";
import type { SessionConfig } from "@/lib/types";
```

(`UserModel` import is dropped — it's no longer constructed by hand here.)

- [ ] **Step 3: Replace the `startSession` function**

Find:

```typescript
  async function startSession() {
    setLoading(true);
    setError(null);
    const userId = sessionStorage.getItem("clouddesk:userId") ?? `user-${Date.now()}`;
    const config: SessionConfig = {
      userId,
      cert,
      role,
      counterpartRole: DIFFICULTY_COUNTERPART[difficulty],
      difficulty,
    };

    sessionStorage.setItem("clouddesk:config", JSON.stringify(config));
    sessionStorage.setItem("clouddesk:userId", userId);

    // Stale-data guard: v1 model had domainScores at top level, not certs
    const rawModel = sessionStorage.getItem("clouddesk:userModel");
    let userModel: UserModel;
    if (rawModel) {
      const parsed = JSON.parse(rawModel) as Record<string, unknown>;
      userModel = parsed.certs && typeof parsed.certs === "object"
        ? (parsed as UserModel)
        : { userId, certs: {} };
    } else {
      userModel = { userId, certs: {} };
    }

    try {
      const res = await fetch("/api/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, userModel }),
      });
      if (!res.ok) throw new Error(`Scenario API error: ${res.status}`);
      const scenario = await res.json();
      sessionStorage.setItem("clouddesk:scenario", JSON.stringify(scenario));
      router.push("/brief");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }
```

Replace with:

```typescript
  async function startSession() {
    setLoading(true);
    setError(null);
    const userId = getUserId();
    const config: SessionConfig = {
      userId,
      cert,
      role,
      counterpartRole: DIFFICULTY_COUNTERPART[difficulty],
      difficulty,
    };

    sessionStorage.setItem("clouddesk:config", JSON.stringify(config));

    const userModel = readUserModel(userId);
    const certProgressBefore = getCertProgress(userModel, cert);
    const isFirstSession = certProgressBefore.sessions.length === 0;

    try {
      const scenario = await generateScenario(config, userModel);
      sessionStorage.setItem("clouddesk:scenario", JSON.stringify(scenario));

      // Loop transparency: state why this scenario was chosen. See
      // CLAUDE.md, Component Rules — "Brief, loop transparency."
      const targetDomainId = scenario.targetDomains[0];
      sessionStorage.setItem(
        "clouddesk:targetContext",
        JSON.stringify({
          domainName: getDomainName(cert, targetDomainId),
          priorScore: certProgressBefore.domainScores[targetDomainId] ?? null,
          isFirstSession,
        }),
      );

      router.push("/brief");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }
```

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: errors remaining only in `app/debrief/page.tsx` and `app/dashboard/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: setup page uses userModel storage helpers, computes loop-transparency context"
```

---

## Task 14: Brief page and BriefCard render the loop-transparency line

**Files:**
- Modify: `app/brief/page.tsx`
- Modify: `components/Brief/BriefCard.tsx`

- [ ] **Step 1: Read both files**

Read `app/brief/page.tsx` and `components/Brief/BriefCard.tsx` to confirm current content before editing.

- [ ] **Step 2: Replace `app/brief/page.tsx`**

```typescript
// app/brief/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BriefCard, type TargetContext } from "@/components/Brief/BriefCard";
import { JoinButton } from "@/components/Brief/JoinButton";
import type { ScenarioOutput } from "@/lib/types";

export default function BriefPage() {
  const router = useRouter();
  const [scenario, setScenario] = useState<ScenarioOutput | null>(null);
  const [targetContext, setTargetContext] = useState<TargetContext | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("clouddesk:scenario");
      if (raw) setScenario(JSON.parse(raw));
      const rawContext = sessionStorage.getItem("clouddesk:targetContext");
      if (rawContext) setTargetContext(JSON.parse(rawContext));
    } catch {
      // malformed storage — treat as missing
    }
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">Loading brief...</p>
      </main>
    );
  }

  if (!scenario) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-zinc-400">No session found.</p>
          <button
            onClick={() => router.push("/")}
            className="text-blue-400 hover:text-blue-300 text-sm underline"
          >
            Start a new session →
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 gap-8">
      <div className="text-center">
        <p className="text-zinc-500 text-sm uppercase tracking-wider mb-2">Incoming meeting</p>
        <h1 className="text-3xl font-bold text-white">Review the brief</h1>
      </div>
      <BriefCard scenario={scenario} targetContext={targetContext} />
      <JoinButton />
    </main>
  );
}
```

- [ ] **Step 3: Replace `components/Brief/BriefCard.tsx`**

```typescript
// components/Brief/BriefCard.tsx
import { Card, CardContent } from "@/components/ui/card";
import { CERT_REGISTRY, getDomainName } from "@/data/domains";
import type { ScenarioOutput } from "@/lib/types";

export type TargetContext = {
  domainName: string;
  priorScore: number | null;
  isFirstSession: boolean;
};

interface Props {
  scenario: ScenarioOutput;
  targetContext?: TargetContext | null;
}

export function BriefCard({ scenario, targetContext }: Props) {
  return (
    <Card className="bg-zinc-900 border-zinc-800 w-full max-w-xl">
      <CardContent className="pt-6 space-y-5">
        {targetContext && (
          <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-4 py-3">
            <p className="text-xs text-blue-400 font-medium mb-1">Why this scenario</p>
            <p className="text-blue-300 text-sm">
              {targetContext.isFirstSession
                ? `Targeting ${targetContext.domainName} — your first session for this cert, so we're starting broad.`
                : `Targeting ${targetContext.domainName} — you scored ${targetContext.priorScore}% here last session.`}
            </p>
          </div>
        )}

        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
            {scenario.counterpartRole === "non-tech" && "You're explaining to"}
            {scenario.counterpartRole === "junior-dev" && "You're being asked by"}
            {scenario.counterpartRole === "team-engineer" && "Your audience"}
            {(scenario.counterpartRole === "client" || !scenario.counterpartRole) && "Your client"}
          </p>
          <h2 className="text-2xl font-semibold text-white">{scenario.clientName}</h2>
          <p className="text-zinc-400">{scenario.clientTitle}{scenario.companyName ? ` · ${scenario.companyName}` : ""}</p>
        </div>

        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Situation</p>
          <p className="text-zinc-300 leading-relaxed">{scenario.problemStatement}</p>
        </div>

        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Constraint</p>
          <p className="text-zinc-400">{scenario.constraint}</p>
        </div>

        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Cert</p>
          <p className="text-zinc-400 text-sm">{CERT_REGISTRY[scenario.cert].name}</p>
        </div>

        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Domains tested</p>
          <div className="flex flex-wrap gap-2">
            {scenario.targetDomains.map((id) => (
              <span
                key={id}
                className="text-xs border rounded-full px-3 py-1 bg-zinc-700 text-zinc-300 border-zinc-600"
              >
                {getDomainName(scenario.cert, id)}
              </span>
            ))}
          </div>
        </div>

        {scenario.tip && (
          <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-4 py-3">
            <p className="text-xs text-amber-400 font-medium mb-1">Tip</p>
            <p className="text-amber-300 text-sm">{scenario.tip}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: errors remaining only in `app/debrief/page.tsx` and `app/dashboard/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add app/brief/page.tsx components/Brief/BriefCard.tsx
git commit -m "feat: brief card states why this scenario was chosen"
```

---

## Task 15: Meeting turn failures preserve the typed message and offer retry

**Files:**
- Modify: `components/MeetingRoom/InputBar.tsx`
- Modify: `app/meeting/page.tsx`

- [ ] **Step 1: Read both files**

Read `components/MeetingRoom/InputBar.tsx` and `app/meeting/page.tsx` to confirm current content before editing.

- [ ] **Step 2: Add a `restoreText` prop to `InputBar`**

Replace the entire file:

```typescript
// components/MeetingRoom/InputBar.tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listen } from "@/lib/speech";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  restoreText?: string;
}

export function InputBar({ onSend, disabled, restoreText }: Props) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // A failed meeting turn hands the unsent text back here rather than
  // letting it vanish. See CLAUDE.md, Failure Behavior.
  useEffect(() => {
    if (restoreText) setText(restoreText);
  }, [restoreText]);

  function handleSend() {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleMic() {
    if (listening || disabled) return;
    setListening(true);
    try {
      const transcript = await listen();
      setText(transcript);
      textareaRef.current?.focus();
    } catch {
      // STT not supported or user denied — silently ignore
    } finally {
      setListening(false);
    }
  }

  return (
    <div className="border-t border-zinc-800 p-4 flex gap-3 items-end bg-zinc-950">
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your response... (Enter to send)"
        disabled={disabled}
        className="flex-1 min-h-[44px] max-h-32 bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 resize-none"
        rows={1}
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={handleMic}
        disabled={disabled || listening}
        className={`text-zinc-400 hover:text-white ${listening ? "text-red-400" : ""}`}
        title="Voice input"
      >
        🎤
      </Button>
      <Button
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        className="bg-blue-600 hover:bg-blue-700 text-white"
      >
        Send
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Replace `app/meeting/page.tsx`**

```typescript
// app/meeting/page.tsx
"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChatPanel } from "@/components/MeetingRoom/ChatPanel";
import { AvatarPanel } from "@/components/MeetingRoom/AvatarPanel";
import { InputBar } from "@/components/MeetingRoom/InputBar";
import { MeetingHeader } from "@/components/MeetingRoom/MeetingHeader";
import { speak } from "@/lib/speech";
import type { ScenarioOutput, Message } from "@/lib/types";

export default function MeetingPage() {
  const router = useRouter();
  const [scenario, setScenario] = useState<ScenarioOutput | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [restoreText, setRestoreText] = useState<string | undefined>(undefined);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  const initialized = useRef(false);

  useEffect(() => {
    const rawScenario = sessionStorage.getItem("clouddesk:scenario");
    if (!rawScenario) { router.replace("/"); return; }
    try {
      setScenario(JSON.parse(rawScenario));
    } catch {
      router.replace("/");
    }
  }, [router]);

  const sendToAgent = useCallback(
    async (
      history: Message[],
      currentScenario: ScenarioOutput,
      retryContext?: { text: string; baseLength: number },
    ) => {
      setIsThinking(true);
      setSendError(null);
      // Intentional 1-2s pacing delay
      await new Promise((r) => setTimeout(r, 1200));

      try {
        const res = await fetch("/api/meeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenario: currentScenario, history }),
        });
        if (!res.ok) throw new Error(`Meeting API error: ${res.status}`);
        const data = await res.json();
        const reply = data.reply as string;

        const newMsg: Message = { role: "assistant", content: reply };
        setMessages((prev) => [...prev, newMsg]);
        setIsThinking(false);

        if (!mutedRef.current) {
          setIsSpeaking(true);
          try {
            await speak(reply, currentScenario.voiceId);
          } finally {
            setIsSpeaking(false);
          }
        }
      } catch {
        setIsThinking(false);
        // Preserve what the user typed — losing it mid-conversation is the
        // worst failure in the app. See CLAUDE.md, Failure Behavior.
        if (retryContext) {
          setMessages((prev) => prev.slice(0, retryContext.baseLength));
          setRestoreText(retryContext.text);
          setSendError("Couldn't reach the meeting agent. Your message is back in the box — send it again.");
        } else {
          setSendError("Couldn't reach the meeting agent.");
        }
      }
    },
    [],
  );

  // Fire opening greeting on mount
  useEffect(() => {
    if (!scenario || initialized.current) return;
    initialized.current = true;
    sendToAgent([], scenario);
  }, [scenario, sendToAgent]);

  async function handleUserMessage(text: string) {
    if (!scenario || isThinking) return;
    const userMsg: Message = { role: "user", content: text };
    const baseLength = messages.length;
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    await sendToAgent(newHistory, scenario, { text, baseLength });
  }

  function retryGreeting() {
    if (!scenario) return;
    sendToAgent([], scenario);
  }

  function handleEndMeeting() {
    sessionStorage.setItem("clouddesk:transcript", JSON.stringify(messages));
    router.push("/debrief");
  }

  if (!scenario) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">Loading meeting...</p>
      </main>
    );
  }

  return (
    <main className="h-screen bg-zinc-950 flex flex-col">
      <MeetingHeader
        clientName={scenario.clientName}
        companyName={scenario.companyName}
        onEnd={handleEndMeeting}
        muted={muted}
        onMuteToggle={() => setMuted((m) => !m)}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-48 border-r border-zinc-800 hidden md:block">
          <AvatarPanel
            clientName={scenario.clientName}
            clientTitle={scenario.clientTitle}
            companyName={scenario.companyName}
            isSpeaking={isSpeaking}
          />
        </div>
        <div className="flex flex-col flex-1 overflow-hidden">
          <ChatPanel
            messages={messages}
            clientName={scenario.clientName}
            isThinking={isThinking}
          />
          {sendError && (
            <div className="px-4 py-2 bg-red-950/40 border-t border-red-900/40 flex items-center justify-between gap-3">
              <p className="text-red-300 text-xs">{sendError}</p>
              {messages.length === 0 && (
                <button onClick={retryGreeting} className="text-red-300 text-xs underline shrink-0">
                  Retry
                </button>
              )}
            </div>
          )}
          <InputBar
            onSend={handleUserMessage}
            disabled={isThinking}
            restoreText={restoreText}
          />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: errors remaining only in `app/debrief/page.tsx` and `app/dashboard/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/MeetingRoom/InputBar.tsx app/meeting/page.tsx
git commit -m "feat: meeting turn failures preserve typed message and offer inline retry"
```

---

## Task 16: Debrief page uses the orchestrator and retries against the in-memory transcript

**Files:**
- Modify: `app/debrief/page.tsx`

- [ ] **Step 1: Read the current file**

Read `app/debrief/page.tsx` to confirm current content before editing.

- [ ] **Step 2: Replace the entire file**

```typescript
// app/debrief/page.tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScoreCard } from "@/components/Debrief/ScoreCard";
import { MomentReplay } from "@/components/Debrief/MomentReplay";
import { ExamIntel } from "@/components/Debrief/ExamIntel";
import { StudyNext } from "@/components/Debrief/StudyNext";
import { finishSession } from "@/agents/orchestrator";
import type { DebriefOutput, ScenarioOutput, Message } from "@/lib/types";

export default function DebriefPage() {
  const router = useRouter();
  const [debrief, setDebrief] = useState<DebriefOutput | null>(null);
  const [scenario, setScenario] = useState<ScenarioOutput | null>(null);
  const [transcript, setTranscript] = useState<Message[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Kept in state (not re-read from sessionStorage) so a retry regrades the
  // exact transcript still in memory rather than whatever's on disk. See
  // CLAUDE.md, Failure Behavior — "Debrief fails."
  const runDebrief = useCallback((currentScenario: ScenarioOutput, currentTranscript: Message[]) => {
    setLoading(true);
    setError(null);
    finishSession(currentScenario, currentTranscript)
      .then((data) => {
        sessionStorage.setItem("clouddesk:debrief", JSON.stringify(data));
        setDebrief(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const rawScenario = sessionStorage.getItem("clouddesk:scenario");
    const rawTranscript = sessionStorage.getItem("clouddesk:transcript");

    if (!rawScenario || !rawTranscript) {
      router.replace("/");
      return;
    }

    let parsedScenario: ScenarioOutput;
    let parsedTranscript: Message[];
    try {
      parsedScenario = JSON.parse(rawScenario);
      parsedTranscript = JSON.parse(rawTranscript);
    } catch {
      router.replace("/");
      return;
    }

    setScenario(parsedScenario);
    setTranscript(parsedTranscript);
    runDebrief(parsedScenario, parsedTranscript);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNextSession() {
    sessionStorage.removeItem("clouddesk:scenario");
    sessionStorage.removeItem("clouddesk:transcript");
    sessionStorage.removeItem("clouddesk:debrief");
    sessionStorage.removeItem("clouddesk:targetContext");
    router.push("/");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-white font-medium">Grading your session...</p>
          <p className="text-zinc-500 text-sm">Analyzing transcript against exam domains</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-400">{error}</p>
          {scenario && transcript && (
            <button
              onClick={() => runDebrief(scenario, transcript)}
              className="text-blue-400 hover:text-blue-300 text-sm underline"
            >
              Retry grading →
            </button>
          )}
        </div>
      </main>
    );
  }

  if (!debrief) return null;

  return (
    <main className="min-h-screen bg-zinc-950 py-12 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <p className="text-zinc-500 text-sm uppercase tracking-wider mb-2">Session complete</p>
          <h1 className="text-3xl font-bold text-white">Your Debrief</h1>
        </div>
        <ScoreCard scores={debrief.scores} />
        <MomentReplay moments={debrief.moments} />
        <ExamIntel examIntel={debrief.examIntel} certId={scenario?.cert ?? "az-104"} />
        <div className="flex justify-center">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-zinc-500 hover:text-zinc-300 text-sm underline underline-offset-2"
          >
            View your progress dashboard →
          </button>
        </div>
        <StudyNext studyNext={debrief.studyNext} onStartNext={startNextSession} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: errors remaining only in `app/dashboard/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/debrief/page.tsx
git commit -m "feat: debrief page uses orchestrator, retries the in-memory transcript on failure"
```

---

## Task 17: Dashboard gets a cert switcher and export/import/reset controls

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Read the current file**

Read `app/dashboard/page.tsx` to confirm current content before editing.

- [ ] **Step 2: Replace the entire file**

```typescript
// app/dashboard/page.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DomainBars } from "@/components/Dashboard/DomainBars";
import { SessionList } from "@/components/Dashboard/SessionList";
import {
  readUserModel,
  getCertProgress,
  getUserId,
  exportUserModel,
  importUserModel,
  resetUserModel,
} from "@/lib/userModel";
import { CERT_REGISTRY, type CertId } from "@/data/domains";
import type { UserModel, CertProgress } from "@/lib/types";

const CERT_IDS = Object.keys(CERT_REGISTRY) as CertId[];

function lastUsedCert(): CertId {
  const raw = sessionStorage.getItem("clouddesk:config");
  if (!raw) return "az-104";
  try {
    const cert = (JSON.parse(raw) as { cert?: CertId }).cert;
    return cert && cert in CERT_REGISTRY ? cert : "az-104";
  } catch {
    return "az-104";
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [model, setModel] = useState<UserModel | null>(null);
  const [certId, setCertId] = useState<CertId>("az-104");
  const [certProgress, setCertProgress] = useState<CertProgress | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function loadModel(forCertId: CertId) {
    const userId = getUserId();
    const m = readUserModel(userId);
    setModel(m);
    setCertProgress(getCertProgress(m, forCertId));
  }

  useEffect(() => {
    const initialCert = lastUsedCert();
    setCertId(initialCert);
    loadModel(initialCert);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSwitchCert(id: CertId) {
    setCertId(id);
    if (model) setCertProgress(getCertProgress(model, id));
  }

  function handleExport() {
    const userId = getUserId();
    const blob = new Blob([exportUserModel(userId)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clouddesk-progress-${userId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      importUserModel(text);
      setNotice("Progress imported.");
      loadModel(certId);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Import failed — file was not a valid export.");
    }
  }

  function handleReset() {
    if (!window.confirm("Reset all progress? This cannot be undone.")) return;
    resetUserModel();
    setNotice("Progress reset.");
    loadModel(certId);
  }

  if (!model || !certProgress) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">Loading dashboard...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-12 px-4">
      <div className="max-w-xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Your Progress</h1>
            <p className="text-zinc-500 text-sm mt-1">{CERT_REGISTRY[certId].name}</p>
          </div>
          <Button
            onClick={() => router.push("/")}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            New Session
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {CERT_IDS.map((id) => (
            <button
              key={id}
              onClick={() => handleSwitchCert(id)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                certId === id
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {id.toUpperCase()}
            </button>
          ))}
        </div>

        <section>
          <h2 className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Domain Scores</h2>
          <DomainBars certId={certId} domainScores={certProgress.domainScores} />
        </section>

        <section>
          <h2 className="text-zinc-400 text-xs uppercase tracking-wider mb-4">
            Sessions ({certProgress.sessions.length})
          </h2>
          <SessionList sessions={certProgress.sessions} />
        </section>

        <section className="border-t border-zinc-800 pt-6 flex flex-wrap gap-2 items-center">
          <Button onClick={handleExport} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200">
            Export progress
          </Button>
          <Button onClick={handleImportClick} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200">
            Import progress
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button onClick={handleReset} className="bg-red-900/40 hover:bg-red-900/60 text-red-300">
            Reset progress
          </Button>
          {notice && <p className="text-xs text-zinc-500 w-full">{notice}</p>}
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: dashboard gets a cert switcher and export/import/reset controls"
```

---

## Task 18: Fix the three remaining doc drifts in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Fix the cert registry file path**

Find in "Certs, Roles, Counterparts":

```
Every session targets exactly one cert, picked first on the setup screen. Adding a cert means one data file plus one registry entry in `lib/certs.ts` — no changes to agents, prompts, or storage. If a cert requires touching an agent, the abstraction is wrong.
```

Replace `lib/certs.ts` with the actual location:

```
Every session targets exactly one cert, picked first on the setup screen. Adding a cert means one data file plus one registry entry in `data/domains/index.ts` — no changes to agents, prompts, or storage. If a cert requires touching an agent, the abstraction is wrong.
```

- [ ] **Step 2: Drop Kokoro, describe the actual TTS stack**

Find in "Stack and Environment":

```
Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, Gemini via Vercel AI SDK, Kokoro TTS (browser WASM), Web Speech API for STT, `localStorage` for state, Vercel for hosting. No database.
```

Replace with:

```
Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, Gemini via Vercel AI SDK, Web Speech API for both TTS (`speak()`) and STT (`listen()`) — no separate voice model to load or preload, `localStorage` for state, Vercel for hosting. No database.
```

Find in "Component Rules" → **MeetingRoom**:

```
**MeetingRoom** — disable input while generating. Show `[ClientName] is thinking...` with a 1–2s delay; this is intentional pacing, do not remove it. Speak the full message after it arrives, never token-by-token. Mute kills audio, keeps text. "End Meeting" confirms first. Preload Kokoro on mount without blocking the greeting.
```

Replace with:

```
**MeetingRoom** — disable input while generating. Show `[ClientName] is thinking...` with a 1–2s delay; this is intentional pacing, do not remove it. Speak the full message after it arrives, never token-by-token, via the Web Speech API — there's no model to preload. Mute kills audio, keeps text. "End Meeting" confirms first.
```

Find in "Failure Behavior":

```
- **Kokoro fails to load** — the meeting continues, text-only, with a visible notice. Audio is an enhancement, never a dependency.
```

Replace with:

```
- **Speech synthesis unavailable** (`window.speechSynthesis` missing, e.g. non-browser or unsupported browser) — the meeting continues text-only; `speak()` resolves immediately instead of throwing. Audio is an enhancement, never a dependency.
```

Find in "What NOT to Do":

```
- Block the greeting on Kokoro
```

Remove that line entirely (there's nothing to block on).

- [ ] **Step 3: Resolve the role/cert coherence open decision**

Find in "Certs, Roles, Counterparts":

```
**Unresolved:** the three user roles were designed around AWS SAA and don't cleanly cover the Azure Associate spread — AZ-104 is an administrator cert, AZ-700 a network engineer cert, and neither maps to any current role. Either certs declare their supported roles, or the scenario prompt reconciles the mismatch. Settle this before authoring more than one domain file.
```

Replace with:

```
**Resolved:** reconciled at the prompt level, not the type level. `buildScenarioPrompt` includes a role↔cert framing instruction that reinterprets any of the 3 roles against whatever domain list the active cert supplies — e.g. a Solutions Architect studying AZ-104 (an administrator exam) gets architectural-decision framing applied to subscription/RBAC/network design, not generic multi-region system design. No `CertDefinition` role field; no setup-screen filtering.
```

Find in "Open Decisions" and remove item 1 (`Role/cert coherence`) from the numbered list, renumbering the remaining two items.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: fix cert registry path, drop Kokoro, resolve role/cert coherence decision"
```

---

## Task 19: Full verification

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass (`lib/scoreMerge.test.ts`, `lib/schemas.test.ts`).

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: clean build, all routes listed, no errors.

- [ ] **Step 4: Manual two-session smoke test (the acceptance test from CLAUDE.md)**

```bash
npm run dev
```

With `GEMINI_API_KEY` set in `.env.local`:

1. Open `http://localhost:3000`, clear any existing localStorage for the site first (DevTools → Application → Local Storage → clear) so this is a clean first run.
2. Pick AZ-104, Solutions Architect, Intermediate → Start Session.
3. On the brief screen, confirm the "Why this scenario" banner reads the first-session copy ("your first session for this cert...").
4. Join the meeting, send 3–4 replies, End Meeting.
5. On the debrief screen, confirm scores render and `Analyzing transcript against exam domains` briefly showed while `finishSession` ran.
6. Go to the dashboard. Confirm the cert switcher shows all 5 certs, AZ-104's weakest domain reflects this session's grading, and the session appears in the session list.
7. Click **Export progress** — confirm a JSON file downloads.
8. Click **New Session**, run a second AZ-104 session targeting the same weakest domain from step 6.
9. Back on the brief screen this time, confirm the banner reads the returning-session copy with a real prior score (not the first-session copy).
10. On the dashboard, confirm the targeted domain's score moved via the α=0.4 blend (not proportionally identical to a 0.3 blend — check against `mergeDomainScore`'s test values if unsure) and that session 2 in the list is newer than session 1.
11. Click **Reset progress**, confirm the domain bars return to the 50% defaults and the session list empties.
12. Click **Import progress** and re-select the file exported in step 7 — confirm both sessions reappear.
13. In DevTools → Network, throttle to "Offline," start a meeting turn, confirm the typed message reappears in the input box with the red retry banner shown, then go back online and confirm re-sending works.

- [ ] **Step 5: Commit final verification**

```bash
git add -A
git commit -m "chore: verified CLAUDE.md alignment end-to-end"
```

---

## Self-Review

**Spec coverage** (CLAUDE.md sections → task):
- Hard Invariant #1 (provider code only in `lib/`) — already true; unchanged by this plan.
- Hard Invariant #2 (agents never touch storage) — Task 9 (debriefAgent drops `updateUserModel`).
- Hard Invariant #3 (orchestrator client-side only, sole caller of `updateUserModel`) — Task 11.
- Hard Invariant #4 (`lib/userModel.ts` only file touching storage) — Task 10, Task 11 (`getUserId` used instead of raw storage calls in orchestrator).
- Hard Invariant #5 (nothing crosses the LLM boundary unvalidated) — Tasks 3, 5, 7, 9.
- Hard Invariant #6 (model never echoes config back) — Tasks 6, 7.
- Hard Invariant #7 (every domain score belongs to a certId) — Task 9 (`buildDomainScoreDelta` filters by cert).
- Hard Invariant #8 (users never see domain IDs) — already true (`BriefCard`, `ExamIntel`, `DomainBars`); unchanged.
- The Feedback Loop (delta pattern, EMA α=0.4, first-observation-raw, drop invalid domains, show debrief even if model update throws) — Tasks 9, 10, 11.
- Agent Contracts — Scenario Agent projection — already true (`getCertProgress` passes only `domainScores`+`seenCombinations` via `buildScenarioTools`); unchanged.
- Agent Contracts — Debrief per-exchange parallel scoring — Tasks 8, 9.
- Certs/Roles/Counterparts — role/cert coherence — Task 6, Task 18.
- Failure Behavior — scenario generation (deferred, documented above), meeting turn (Task 15), debrief (Task 16), storage unavailable (already true), speech unavailable (already true, doc corrected in Task 18).
- Component Rules — Brief loop transparency — Tasks 13, 14. Dashboard cert switcher + export/import/reset — Task 17.
- Stack — `localStorage`, Kokoro removal — Tasks 10, 18.
- Open Decisions #1 (role/cert coherence) — Task 18.

**Placeholder scan:** none — every step has complete file contents or exact find/replace text.

**Type consistency:** `ScenarioOutput` (Task 4) is produced in Task 7 by spreading `GeneratedScenario` (Task 3) with `config.difficulty`/`counterpartRole`/`cert` — matches. `DomainScoreDelta` (Task 4) is produced by `debriefAgent` (Task 9) and consumed by `updateUserModel` (Task 10) with identical shape (`Record<string, number>`). `updateUserModel`'s new signature `(certId, scenario, debrief, delta)` (Task 10) matches its only call site in `orchestrator.finishSession` (Task 11). `debriefAgent`'s new return shape `{ debrief, delta }` (Task 9) matches what `app/api/debrief/route.ts` destructures (Task 12) and what `orchestrator.finishSession` destructures (Task 11). `InputBar`'s new `restoreText` prop (Task 15) matches what `app/meeting/page.tsx` passes (Task 15, same task). `BriefCard`'s new `targetContext` prop and exported `TargetContext` type (Task 14) match what `app/brief/page.tsx` imports and passes (Task 14, same task).
