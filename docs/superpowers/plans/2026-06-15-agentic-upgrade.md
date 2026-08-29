# CloudDesk Agentic Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade CloudDesk's three agents to use real tool calling (Vercel AI SDK) for ScenarioAgent and two-step reasoning for DebriefAgent, replacing the hand-rolled Gemini SDK.

**Architecture:** ScenarioAgent calls three tools (`readDomainScores`, `listSeenCombinations`, `validateScenario`) via `generateText({ tools, maxSteps: 4 })`; the AI SDK handles the tool-call loop automatically. DebriefAgent splits into two sequential `callLLM` calls — per-exchange scoring first, then synthesis. All LLM access goes through `lib/llm.ts`; no agent touches a provider SDK directly.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vercel AI SDK (`ai` + `@ai-sdk/google`), Zod, Gemini 2.5 Flash.

---

## File Map

| File | Change |
|---|---|
| `package.json` | Add `ai`, `@ai-sdk/google`; zod already present transitively |
| `lib/llm.ts` | Rewrite to use `generateText`; add `callLLMWithTools` |
| `lib/tools.ts` | Create — three `tool()` definitions as closure factory |
| `agents/scenarioAgent.ts` | Switch to `callLLMWithTools`, remove retry loop |
| `agents/debriefAgent.ts` | Two-step pipeline |
| `prompts/scenarioAgent.ts` | Remove pre-injected data, add tool-use instructions |
| `prompts/debriefAgent.ts` | Add Step 1 exchange-analysis prompt |
| `app/api/scenario/route.ts` | Accept `userModel` in body, pass to `scenarioAgent` |
| `app/page.tsx` | Send `userModel` snapshot in scenario fetch body |

---

## Task 1: Install Vercel AI SDK

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
cd /Users/cmante/Documents/root/clouddesk
npm install ai @ai-sdk/google
```

Expected output: packages added, no peer dep errors.

- [ ] **Step 2: Verify zod is available at the right version**

```bash
node -e "const { z } = require('zod'); console.log(z.string().parse('ok'))"
```

Expected: `ok` — zod is already present as a transitive dep from `@google/genai`. If this errors, run `npm install zod`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install ai and @ai-sdk/google"
```

---

## Task 2: Rewrite `lib/llm.ts` to use Vercel AI SDK

**Files:**
- Modify: `lib/llm.ts`

The current `lib/llm.ts` uses `@google/genai` directly. We replace its internals with `generateText` from the AI SDK. External signatures of `callLLM` stay identical so all callers continue working. We add `callLLMWithTools` for ScenarioAgent.

- [ ] **Step 1: Write the new `lib/llm.ts`**

Replace the entire file content:

```typescript
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import type { Message, LLMOpts, UserModel } from "./types";
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
  userModel: UserModel,
  opts: LLMOpts = {},
): Promise<string> {
  const tools = buildScenarioTools(userModel);
  const { text } = await generateText({
    model: MODEL,
    system: systemPrompt,
    messages: toAIMessages(messages),
    tools,
    maxSteps: 4,
    temperature: opts.temperature ?? 0.8,
  });
  return text;
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit
```

Expected: errors about missing `buildScenarioTools` (from `./tools`) and missing `UserModel` import — that's correct, we haven't created `lib/tools.ts` yet. Any other errors need fixing before moving on.

- [ ] **Step 3: Commit**

```bash
git add lib/llm.ts
git commit -m "feat: rewrite llm adapter to use Vercel AI SDK"
```

---

## Task 3: Create `lib/tools.ts`

**Files:**
- Create: `lib/tools.ts`

Tools are built as a factory function `buildScenarioTools(userModel)` that closes over the user model snapshot. This avoids global state — each `callLLMWithTools` call gets its own tool set bound to the request's model snapshot.

The three tools:
- `readDomainScores` — no args, returns `domainScores` from the snapshot
- `listSeenCombinations` — no args, returns `seenCombinations` array
- `validateScenario` — takes a partial scenario object, validates it against two rules

Note: `zod` is imported from `zod` directly. It's available as a transitive dep. If the import fails at runtime, run `npm install zod` explicitly.

- [ ] **Step 1: Create `lib/tools.ts`**

```typescript
import { tool } from "ai";
import { z } from "zod";
import type { UserModel } from "./types";
import { SAA_DOMAINS } from "@/data/domains/aws-saa-c03";

const AWS_SERVICE_PATTERN =
  /\b(EC2|S3|RDS|Lambda|DynamoDB|CloudFront|Route\s?53|VPC|IAM|KMS|ELB|ALB|NLB|ECS|EKS|SQS|SNS|ElastiCache|Redshift|Glacier|CloudWatch|CloudTrail|WAF|Shield|Cognito|Secrets\s?Manager|Auto\s?Scaling|Elastic\s?Beanstalk|API\s?Gateway|Step\s?Functions|Glue|Athena|EMR)\b/i;

export function buildScenarioTools(userModel: UserModel) {
  return {
    readDomainScores: tool({
      description:
        "Read the user's current domain score for each SAA-C03 domain. Call this first to understand which domain to target.",
      parameters: z.object({}),
      execute: async () => userModel.domainScores,
    }),

    listSeenCombinations: tool({
      description:
        "List industry:problem combinations the user has already seen. Use this to avoid generating a repeat scenario.",
      parameters: z.object({}),
      execute: async () => userModel.seenCombinations,
    }),

    validateScenario: tool({
      description:
        "Validate a generated scenario before returning it. Checks that targetDomains includes the weakest domain and that problemStatement contains no AWS service names. Call this before producing your final JSON output.",
      parameters: z.object({
        targetDomains: z
          .array(z.string())
          .describe("The targetDomains array from your generated scenario"),
        problemStatement: z
          .string()
          .describe("The problemStatement from your generated scenario"),
        weakestDomain: z
          .string()
          .describe("The domain ID you identified as weakest from readDomainScores"),
      }),
      execute: async ({ targetDomains, problemStatement, weakestDomain }) => {
        if (!targetDomains.includes(weakestDomain)) {
          return {
            valid: false,
            reason: `targetDomains must include "${weakestDomain}" (the user's weakest domain). Found: [${targetDomains.join(", ")}]`,
          };
        }
        if (AWS_SERVICE_PATTERN.test(problemStatement)) {
          const match = problemStatement.match(AWS_SERVICE_PATTERN)?.[0];
          return {
            valid: false,
            reason: `problemStatement must describe a business problem only — no AWS service names. Found: "${match}". Rewrite without mentioning AWS services.`,
          };
        }
        return { valid: true, reason: "Scenario looks good." };
      },
    }),
  };
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit
```

Expected: the `lib/llm.ts` import errors from Task 2 should now be resolved. Zero errors expected. Fix any type errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add lib/tools.ts
git commit -m "feat: add scenario tool registry with Vercel AI SDK tool()"
```

---

## Task 4: Update `lib/types.ts` — add `UserModel` export check

**Files:**
- Read: `lib/types.ts`

`callLLMWithTools` now takes a `UserModel` parameter. Verify `UserModel` is exported from `lib/types.ts` (it is — this task is just a safety check before wiring agents).

- [ ] **Step 1: Verify `UserModel` is exported**

```bash
grep "export type UserModel" /Users/cmante/Documents/root/clouddesk/lib/types.ts
```

Expected output: `export type UserModel = {`

If missing, open `lib/types.ts` and add the export. (It's already there — this just confirms it.)

- [ ] **Step 2: No commit needed** — this task is verification only.

---

## Task 5: Update `prompts/scenarioAgent.ts`

**Files:**
- Modify: `prompts/scenarioAgent.ts`

Remove the pre-injected domain scores and seen combinations from the system prompt — the model will fetch them via tools instead. Add explicit tool-use instructions so the model knows what to call and in what order.

- [ ] **Step 1: Replace `prompts/scenarioAgent.ts`**

```typescript
import { SAA_DOMAINS } from "@/data/domains/aws-saa-c03";

export function buildScenarioPrompt(): string {
  const domainList = SAA_DOMAINS.map(
    (d) => `- ${d.id}: ${d.name} (key services: ${d.keyServices.join(", ")}; concepts: ${d.concepts.join(", ")})`
  ).join("\n");

  return `You are a scenario generator for AWS Solutions Architect Associate (SAA-C03) exam prep.

You have access to three tools. Use them in this order:
1. Call readDomainScores — identify the domain with the lowest score (that is the weakest domain)
2. Call listSeenCombinations — note which industry:problem combinations to avoid
3. Generate a scenario JSON targeting the weakest domain
4. Call validateScenario — pass your targetDomains, problemStatement, and the weakest domain ID
5. If validateScenario returns valid: false, fix the issue and call validateScenario again
6. Once validateScenario returns valid: true, output the final scenario JSON

SCENARIO RULES:
- Return ONLY valid JSON matching the schema below — no markdown, no commentary
- The problemStatement describes a BUSINESS problem only — never mention AWS services or technical solutions
- The curveball is a mid-meeting complication injected after exchange 5–8; keep it business-level
- The industry and problem must NOT match any previously seen combination
- targetDomains must include the weakest domain and may include 1–2 others
- voiceId must be one of: af_sarah, af_bella, am_adam, am_michael

SAA-C03 DOMAINS:
${domainList}

Return this exact JSON shape:
{
  "clientName": "string",
  "clientTitle": "string",
  "companyName": "string",
  "industry": "string",
  "problemStatement": "string (2-3 sentences, business problem only — no AWS service names)",
  "constraint": "string (one business constraint: budget/timeline/regulatory)",
  "targetDomains": ["string — domain IDs"],
  "curveball": "string (one sentence business complication)",
  "difficulty": "beginner|intermediate|expert",
  "tip": "string or null (beginner only — one actionable hint)",
  "voiceId": "af_sarah|af_bella|am_adam|am_michael"
}`;
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add prompts/scenarioAgent.ts
git commit -m "feat: update scenario prompt for tool-based context fetching"
```

---

## Task 6: Update `agents/scenarioAgent.ts`

**Files:**
- Modify: `agents/scenarioAgent.ts`

Switch from `callLLM` to `callLLMWithTools`. Remove the 3-attempt retry loop — `validateScenario` tool handles self-correction. Pass the `userModel` snapshot received from the API route.

- [ ] **Step 1: Replace `agents/scenarioAgent.ts`**

```typescript
import { callLLMWithTools } from "@/lib/llm";
import { buildScenarioPrompt } from "@/prompts/scenarioAgent";
import type { ScenarioOutput, SessionConfig, UserModel } from "@/lib/types";

export async function scenarioAgent(
  config: SessionConfig,
  userModel: UserModel,
): Promise<ScenarioOutput> {
  const systemPrompt = buildScenarioPrompt();

  const raw = await callLLMWithTools(
    systemPrompt,
    [{ role: "user", content: `Generate a ${config.difficulty} scenario.` }],
    userModel,
    { temperature: 0.9 },
  );

  try {
    return JSON.parse(raw) as ScenarioOutput;
  } catch {
    throw new Error(`scenarioAgent: failed to parse LLM response as JSON. Raw: ${raw.slice(0, 200)}`);
  }
}
```

Note: the `userId` parameter is removed — the agent now receives the full `userModel` snapshot directly from the API route. The API route is responsible for reading userModel from the request body.

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit
```

Expected: errors about `orchestrator.ts` calling `scenarioAgent` with old signature — those are fixed in Task 8. Any other errors need fixing now.

- [ ] **Step 3: Commit**

```bash
git add agents/scenarioAgent.ts
git commit -m "feat: scenarioAgent uses callLLMWithTools with real tool calling"
```

---

## Task 7: Update `prompts/debriefAgent.ts`

**Files:**
- Modify: `prompts/debriefAgent.ts`

Add a second exported function `buildExchangeAnalysisPrompt` for the new Step 1 call. The existing `buildDebriefPrompt` is kept and updated to accept exchange analysis as additional context for Step 2.

- [ ] **Step 1: Replace `prompts/debriefAgent.ts`**

```typescript
import type { ScenarioOutput } from "@/lib/types";
import { SAA_DOMAINS } from "@/data/domains/aws-saa-c03";

export function buildExchangeAnalysisPrompt(scenario: ScenarioOutput): string {
  return `You are an AWS SAA-C03 exam coach reviewing a mock client meeting transcript.

SCENARIO: ${scenario.clientName} (${scenario.clientTitle}) at ${scenario.companyName}
PROBLEM: ${scenario.problemStatement}
TARGET DOMAINS: ${scenario.targetDomains.join(", ")}

TASK: Score each user message independently. Do NOT synthesize or give overall scores yet.

For each exchange where the user spoke, output one entry. An "exchange" is one user message and the AI reply that preceded it.

Return ONLY a JSON array — no markdown, no commentary:
[
  {
    "exchangeIndex": number,
    "score": number (0-100, how well the user addressed the scenario domain in this message),
    "type": "good" | "incomplete" | "missed",
    "annotation": "string — what was strong, what was missing, and which SAA-C03 concept this tests"
  }
]

Scoring guide:
- good (70-100): Correct AWS approach, explained why, addressed the client's concern
- incomplete (40-69): Correct direction but vague, missing justification, or only partially addressed
- missed (0-39): Wrong service, ignored the question, buzzword-heavy with no substance`;
}

export function buildDebriefPrompt(
  scenario: ScenarioOutput,
  exchangeAnalysis: string,
): string {
  const domainList = SAA_DOMAINS.map(
    (d) => `- ${d.id}: ${d.name} (exam weight ${Math.round(d.weight * 100)}%)`,
  ).join("\n");

  return `You are an AWS SAA-C03 exam coach producing a final debrief report.

SCENARIO CONTEXT:
- Client: ${scenario.clientName} (${scenario.clientTitle}) at ${scenario.companyName}
- Problem: ${scenario.problemStatement}
- Target domains: ${scenario.targetDomains.join(", ")}

SAA-C03 DOMAINS:
${domainList}

EXCHANGE-LEVEL ANALYSIS (use this as your evidence — do not re-read the transcript independently):
${exchangeAnalysis}

TASK: Synthesize the exchange analysis into a final debrief. Derive scores from the evidence above.

Return ONLY valid JSON — no markdown, no commentary:
{
  "scores": {
    "technicalAccuracy": number (0-100, weighted average of exchange scores where AWS correctness was tested),
    "depthOfExplanation": number (0-100, did the user explain WHY, not just WHAT),
    "domainCoverage": number (0-100, how well the target domains were addressed across all exchanges),
    "communicationClarity": number (0-100, was the explanation clear to a non-technical client),
    "overall": number (0-100, weighted mean of the four scores above)
  },
  "moments": [
    {
      "exchangeIndex": number,
      "type": "good|incomplete|missed",
      "userMessage": "exact quote from transcript",
      "annotation": "what was good/missing and why",
      "certRelevance": "which SAA-C03 concept this tests (optional)"
    }
  ],
  "examIntel": {
    "domainsExercised": ["resilient|performance|secure|cost"],
    "examQuestionExample": "A company needs... Which solution? (A)...(B)...(C)...(D)...",
    "keyConceptsTested": ["string"]
  },
  "studyNext": {
    "weakAreas": ["string — cite specific exchange indices as evidence, e.g. 'IAM least-privilege (exchanges 3, 7 were incomplete)'"],
    "suggestedTopics": ["string"],
    "suggestedNextScenario": "one sentence describing ideal next scenario based on weak areas"
  }
}`;
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit
```

Expected: errors about `debriefAgent.ts` calling `buildDebriefPrompt` with old signature — fixed in Task 8. Any other errors fix now.

- [ ] **Step 3: Commit**

```bash
git add prompts/debriefAgent.ts
git commit -m "feat: add exchange analysis prompt, update synthesis prompt for two-step debrief"
```

---

## Task 8: Update `agents/debriefAgent.ts`

**Files:**
- Modify: `agents/debriefAgent.ts`

Split into two sequential `callLLM` calls. External signature unchanged — same inputs, same `DebriefOutput` return type. `ExchangeAnalysis` type is internal only.

- [ ] **Step 1: Replace `agents/debriefAgent.ts`**

```typescript
import { callLLM } from "@/lib/llm";
import { buildExchangeAnalysisPrompt, buildDebriefPrompt } from "@/prompts/debriefAgent";
import type { DebriefOutput, Message, ScenarioOutput } from "@/lib/types";

type ExchangeAnalysis = {
  exchangeIndex: number;
  score: number;
  type: "good" | "incomplete" | "missed";
  annotation: string;
};

export async function debriefAgent(
  transcript: Message[],
  scenario: ScenarioOutput,
): Promise<DebriefOutput> {
  const transcriptText = transcript
    .map((m) => `${m.role === "user" ? "Candidate" : scenario.clientName}: ${m.content}`)
    .join("\n\n");

  // Step 1: score each exchange independently
  const analysisRaw = await callLLM(
    buildExchangeAnalysisPrompt(scenario),
    [{ role: "user", content: `Transcript:\n\n${transcriptText}` }],
    { json: true, temperature: 0.1 },
  );

  let exchangeAnalysis: ExchangeAnalysis[];
  try {
    exchangeAnalysis = JSON.parse(analysisRaw) as ExchangeAnalysis[];
  } catch {
    throw new Error(`debriefAgent step 1: failed to parse exchange analysis. Raw: ${analysisRaw.slice(0, 200)}`);
  }

  const analysisText = JSON.stringify(exchangeAnalysis, null, 2);

  // Step 2: synthesize final debrief from exchange evidence
  const debriefRaw = await callLLM(
    buildDebriefPrompt(scenario, analysisText),
    [{ role: "user", content: `Transcript:\n\n${transcriptText}` }],
    { json: true, temperature: 0.2 },
  );

  try {
    return JSON.parse(debriefRaw) as DebriefOutput;
  } catch {
    throw new Error(`debriefAgent step 2: failed to parse debrief. Raw: ${debriefRaw.slice(0, 200)}`);
  }
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit
```

Expected: zero errors at this point (both prompt functions now match their call sites).

- [ ] **Step 3: Commit**

```bash
git add agents/debriefAgent.ts
git commit -m "feat: two-step debrief — exchange analysis then synthesis"
```

---

## Task 9: Update `agents/orchestrator.ts`

**Files:**
- Modify: `agents/orchestrator.ts`

`startSession` previously called `scenarioAgent(userId, config)`. The new signature is `scenarioAgent(config, userModel)`. Update the call site and accept `userModel` as a parameter.

- [ ] **Step 1: Replace `agents/orchestrator.ts`**

```typescript
import { scenarioAgent } from "./scenarioAgent";
import { debriefAgent } from "./debriefAgent";
import type { ScenarioOutput, Message, SessionConfig, DebriefOutput, UserModel } from "@/lib/types";

export async function startSession(
  config: SessionConfig,
  userModel: UserModel,
): Promise<ScenarioOutput> {
  return scenarioAgent(config, userModel);
}

export async function finishSession(
  scenario: ScenarioOutput,
  transcript: Message[],
): Promise<DebriefOutput> {
  return debriefAgent(transcript, scenario);
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit
```

Expected: errors about `app/api/scenario/route.ts` calling `startSession` with old signature — fixed in Task 10. Any other errors fix now.

- [ ] **Step 3: Commit**

```bash
git add agents/orchestrator.ts
git commit -m "feat: pass userModel through orchestrator to scenarioAgent"
```

---

## Task 10: Update `app/api/scenario/route.ts`

**Files:**
- Modify: `app/api/scenario/route.ts`

Accept `userModel` in the request body and pass it to `startSession`. The client sends this — it reads from its own `sessionStorage` before calling the API.

- [ ] **Step 1: Replace `app/api/scenario/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { startSession } from "@/agents/orchestrator";
import type { SessionConfig, UserModel } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { config, userModel } = (await req.json()) as {
      config: SessionConfig;
      userModel: UserModel;
    };
    const scenario = await startSession(config, userModel);
    return NextResponse.json(scenario);
  } catch (err) {
    console.error("scenario route error:", err);
    return NextResponse.json(
      { error: "Failed to generate scenario" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/scenario/route.ts
git commit -m "feat: scenario route accepts userModel snapshot from client"
```

---

## Task 11: Update `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

Read the current `userModel` from `sessionStorage` and send it in the scenario API request body. This is the mechanism that lets the server-side tools access user history.

- [ ] **Step 1: Update the `startSession` function in `app/page.tsx`**

Find the `startSession` function (currently around line 22). Replace it with:

```typescript
async function startSession() {
  setLoading(true);
  setError(null);
  const userId = `user-${Date.now()}`;
  const config: SessionConfig = {
    userId,
    role: "solutions-architect",
    difficulty,
  };

  sessionStorage.setItem("clouddesk:config", JSON.stringify(config));
  sessionStorage.setItem("clouddesk:userId", userId);

  // Read existing userModel so tools can access domain scores and seen combos
  const rawModel = sessionStorage.getItem("clouddesk:userModel");
  const userModel = rawModel
    ? JSON.parse(rawModel)
    : { userId, sessions: [], domainScores: { resilient: 50, performance: 50, secure: 50, cost: 50 }, seenCombinations: [] };

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

Also add `import type { SessionConfig } from "@/lib/types";` if it's not already there (it is — verify with a quick read).

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: send userModel snapshot from client to scenario API"
```

---

## Task 12: Update `lib/userModel.ts` — persist to localStorage key

**Files:**
- Read: `lib/userModel.ts`

Currently `userModel.ts` uses `sessionStorage` with key `clouddesk:userModel` — but `app/page.tsx` also reads from that key. Verify the key matches. The key in `userModel.ts` is currently `clouddesk:userModel` (defined as `const KEY`). `app/page.tsx` Task 11 reads from `clouddesk:userModel`. These must match.

- [ ] **Step 1: Verify the storage key**

```bash
grep "const KEY" /Users/cmante/Documents/root/clouddesk/lib/userModel.ts
```

Expected: `const KEY = "clouddesk:userModel";`

If the key is different (e.g. just `"clouddesk:user"`), update `app/page.tsx` Task 11 to match — do NOT change `userModel.ts`.

- [ ] **Step 2: No commit needed** — verification only.

---

## Task 13: Smoke test the full session flow

No automated test framework is set up. This task verifies the feature works end-to-end in the browser.

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/cmante/Documents/root/clouddesk
npm run dev
```

Open `http://localhost:3000`.

- [ ] **Step 2: First session — fresh user model**

1. Open DevTools → Application → Session Storage. Confirm `clouddesk:userModel` does not exist.
2. Click Start Session (any difficulty).
3. In the Network tab, inspect the `/api/scenario` POST request body. Confirm it contains `userModel` with `domainScores: { resilient: 50, performance: 50, secure: 50, cost: 50 }`.
4. Confirm the brief page loads with a valid scenario.
5. Complete 3–5 meeting exchanges, then End Meeting.
6. Confirm the debrief page loads with scores, moments, and study suggestions.
7. Confirm `clouddesk:userModel` is now set in sessionStorage with updated `domainScores`.

- [ ] **Step 3: Second session — verify tool calling targets weak domain**

1. From the debrief or dashboard, start a new session.
2. Inspect the `/api/scenario` POST body — `userModel.domainScores` should reflect the updated scores from session 1 (not all 50s).
3. Confirm the scenario's `targetDomains` includes the domain with the lowest score from session 1.

- [ ] **Step 4: Verify validateScenario self-correction fires (optional)**

Add a temporary `console.log` in `lib/tools.ts` inside `validateScenario.execute`:
```typescript
execute: async ({ targetDomains, problemStatement, weakestDomain }) => {
  console.log("[validateScenario]", { targetDomains, problemStatement, weakestDomain });
  // ... rest of function
```

Re-run a session and check server logs. You should see `[validateScenario]` printed, confirming the tool is being called by the model.

Remove the log and commit:
```bash
git add lib/tools.ts
git commit -m "chore: remove debug log from validateScenario"
```

---

## Task 14: Remove `@google/genai` dependency

**Files:**
- Modify: `package.json`

The old `@google/genai` SDK is no longer used. Remove it.

- [ ] **Step 1: Uninstall**

```bash
cd /Users/cmante/Documents/root/clouddesk
npm uninstall @google/genai
```

- [ ] **Step 2: Verify no remaining imports**

```bash
grep -r "@google/genai" /Users/cmante/Documents/root/clouddesk --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Expected: no output.

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: successful build, no import errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove @google/genai, fully migrated to Vercel AI SDK"
```
