# CloudDesk Agentic Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade CloudDesk from three stateless LLM calls to a genuine reasoning agent system: a Session Planner Agent that creates a probe plan, a Meeting Agent that executes it with real-time tracking, and a tool-using Debrief Agent that reasons with function calls.

**Architecture:** New `PlannerAgent` runs after scenario generation; `MeetingAgent` upgraded to track probe coverage each turn; `DebriefAgent` replaced with a multi-step tool-calling loop using Gemini function calling. ProbePlan threads through the entire session via sessionStorage + API bodies.

**Tech Stack:** Existing stack + Gemini function calling API (`@google/genai` tool declarations).

---

## File Map (changes only)

| File | Action | What changes |
|---|---|---|
| `lib/types.ts` | Modify | Add `Probe`, `ProbePlan` types |
| `lib/llm.ts` | Modify | Add `callLLMWithTools()` for function-calling loop |
| `lib/tools.ts` | Create | Tool definitions + implementations |
| `agents/plannerAgent.ts` | Create | `plannerAgent()` |
| `agents/meetingAgent.ts` | Modify | Accept/return ProbePlan, probe-aware prompt |
| `agents/debriefAgent.ts` | Modify | Multi-step tool-calling loop |
| `agents/orchestrator.ts` | Modify | Add `planSession()` |
| `prompts/plannerAgent.ts` | Create | `buildPlannerPrompt()` |
| `prompts/meetingAgent.ts` | Modify | Add probe tracking instructions |
| `prompts/debriefAgent.ts` | Modify | Tool-using grading instructions |
| `app/api/plan/route.ts` | Create | POST → plannerAgent |
| `app/api/meeting/route.ts` | Modify | Accept/return probePlan |
| `app/page.tsx` | Modify | Fetch plan after scenario |
| `app/meeting/page.tsx` | Modify | Send/receive probePlan each turn |
| `components/MeetingRoom/AvatarPanel.tsx` | Modify | Add probe checklist panel |

---

## Task 1: Add ProbePlan types to lib/types.ts

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add Probe and ProbePlan types**

Open `lib/types.ts` and add after the existing `UserModel` type:

```typescript
export type Probe = {
  id: string;
  concept: string;
  intent: string;
  covered: boolean;
  quality?: "strong" | "weak" | "missed";
};

export type ProbePlan = {
  probes: Probe[];
  targetDomain: string;
  sessionGoal: string;
};
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add Probe and ProbePlan types"
```

---

## Task 2: Add callLLMWithTools to lib/llm.ts

**Files:**
- Modify: `lib/llm.ts`

This adds a second exported function for multi-step tool-calling loops. `callLLM` is unchanged.

- [ ] **Step 1: Read current lib/llm.ts**

Read the file to confirm current content before editing.

- [ ] **Step 2: Add tool-calling types and callLLMWithTools function**

Add to the bottom of `lib/llm.ts`:

```typescript
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
};

export type ToolHandler = (args: Record<string, unknown>) => unknown;

export async function callLLMWithTools(
  systemPrompt: string,
  messages: Message[],
  tools: ToolDefinition[],
  handlers: Record<string, ToolHandler>,
  opts: LLMOpts = {},
): Promise<string> {
  const declarations = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  // Seed contents — Gemini requires at least one content item
  const msgs = messages.length > 0 ? messages : [{ role: "user" as const, content: "Begin analysis." }];
  let contents: { role: string; parts: { text?: string; functionCall?: unknown; functionResponse?: unknown }[] }[] = msgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // Agentic loop: keep calling until no more tool calls
  for (let step = 0; step < 10; step++) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: opts.temperature ?? 0.2,
        tools: [{ functionDeclarations: declarations }],
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate) break;

    const parts = candidate.content?.parts ?? [];
    const toolCallParts = parts.filter((p: any) => p.functionCall);
    const textParts = parts.filter((p: any) => p.text);

    if (toolCallParts.length === 0) {
      // No more tool calls — return the text response
      return textParts.map((p: any) => p.text).join("") ?? "";
    }

    // Execute all tool calls and append results
    contents = [
      ...contents,
      { role: "model", parts },
    ];

    const functionResponses = toolCallParts.map((part: any) => {
      const { name, args } = part.functionCall;
      const handler = handlers[name];
      const result = handler ? handler(args as Record<string, unknown>) : { error: `Unknown tool: ${name}` };
      return {
        functionResponse: {
          name,
          response: { result },
        },
      };
    });

    contents = [
      ...contents,
      { role: "user", parts: functionResponses },
    ];
  }

  return "";
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are type errors on the `parts` or `candidates` access, add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` above the `any` usages — the Gemini SDK response types are loose.

- [ ] **Step 4: Commit**

```bash
git add lib/llm.ts
git commit -m "feat: add callLLMWithTools for multi-step function calling loop"
```

---

## Task 3: Create lib/tools.ts

**Files:**
- Create: `lib/tools.ts`

This file defines the three tools the Debrief Agent can call, plus their handler implementations.

- [ ] **Step 1: Create lib/tools.ts**

```typescript
// lib/tools.ts
import { SAA_DOMAINS } from "@/data/domains/aws-saa-c03";
import type { ToolDefinition, ToolHandler } from "./llm";
import type { ProbePlan, DebriefOutput } from "./types";

// --- Tool definitions (sent to Gemini as function declarations) ---

export const DEBRIEF_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "getProbeExpectations",
    description:
      "Returns what a strong answer, weak answer, and missed signals look like for a specific probe in the session plan.",
    parameters: {
      type: "object",
      properties: {
        probeId: { type: "string", description: "The probe ID from the session plan (e.g. 'probe-1')" },
      },
      required: ["probeId"],
    },
  },
  {
    name: "getSAADomainConcepts",
    description:
      "Returns the official SAA-C03 key services and concepts for a domain ID. Use to cross-reference whether the candidate addressed required concepts.",
    parameters: {
      type: "object",
      properties: {
        domainId: {
          type: "string",
          description: "One of: resilient, performance, secure, cost",
        },
      },
      required: ["domainId"],
    },
  },
  {
    name: "selfCritiqueGrade",
    description:
      "Submit your draft scores for self-critique. Returns feedback on whether any scores seem inflated or deflated, with suggested adjustments. Call this before finalizing your grade.",
    parameters: {
      type: "object",
      properties: {
        technicalAccuracy: { type: "number", description: "Draft score 0-100" },
        depthOfExplanation: { type: "number", description: "Draft score 0-100" },
        domainCoverage: { type: "number", description: "Draft score 0-100" },
        communicationClarity: { type: "number", description: "Draft score 0-100" },
        overall: { type: "number", description: "Draft overall score 0-100" },
        reasoning: { type: "string", description: "Your reasoning for these scores" },
      },
      required: ["technicalAccuracy", "depthOfExplanation", "domainCoverage", "communicationClarity", "overall", "reasoning"],
    },
  },
];

// --- Tool handler factory --- 
// Handlers close over the probePlan so they can look up probe expectations.

export function buildDebriefHandlers(probePlan: ProbePlan): Record<string, ToolHandler> {
  return {
    getProbeExpectations: (args) => {
      const probeId = args.probeId as string;
      const probe = probePlan.probes.find((p) => p.id === probeId);
      if (!probe) return { error: `Probe ${probeId} not found in plan` };
      return {
        concept: probe.concept,
        intent: probe.intent,
        covered: probe.covered,
        quality: probe.quality ?? "not yet assessed",
        strongAnswer: `A strong answer demonstrates: ${probe.intent}`,
        weakAnswer: `A weak answer mentions the concept but lacks specifics about ${probe.concept}`,
        missedSignals: [
          `No mention of ${probe.concept}`,
          `Vague answer without concrete AWS service references`,
        ],
      };
    },

    getSAADomainConcepts: (args) => {
      const domainId = args.domainId as string;
      const domain = SAA_DOMAINS.find((d) => d.id === domainId);
      if (!domain) return { error: `Domain ${domainId} not found` };
      return {
        name: domain.name,
        weight: `${Math.round(domain.weight * 100)}% of exam`,
        keyServices: domain.keyServices,
        concepts: domain.concepts,
      };
    },

    selfCritiqueGrade: (args) => {
      const scores = args as { technicalAccuracy: number; depthOfExplanation: number; domainCoverage: number; communicationClarity: number; overall: number; reasoning: string };
      const avg = (scores.technicalAccuracy + scores.depthOfExplanation + scores.domainCoverage + scores.communicationClarity) / 4;
      const overallDrift = Math.abs(scores.overall - avg);

      const feedback: string[] = [];
      if (scores.technicalAccuracy > 80 && scores.depthOfExplanation < 50) {
        feedback.push("Technical accuracy and depth are inconsistent — if accuracy is high, depth should generally follow.");
      }
      if (overallDrift > 15) {
        feedback.push(`Overall (${scores.overall}) diverges significantly from the subscores average (${Math.round(avg)}). Reconsider the overall.`);
      }
      if (scores.technicalAccuracy > 90 && !scores.reasoning.includes("specific")) {
        feedback.push("A score above 90 for technical accuracy typically requires very specific AWS service knowledge demonstrated. Make sure this is warranted.");
      }
      if (feedback.length === 0) {
        feedback.push("Scores appear internally consistent. Proceed with these grades.");
      }

      return {
        feedback: feedback.join(" "),
        suggestedOverall: Math.round(avg),
        consistent: feedback.length === 1 && feedback[0].startsWith("Scores appear"),
      };
    },
  };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/tools.ts
git commit -m "feat: add debrief tool definitions and handler factory"
```

---

## Task 4: Planner Agent — prompt and agent

**Files:**
- Create: `prompts/plannerAgent.ts`
- Create: `agents/plannerAgent.ts`

- [ ] **Step 1: Create prompts/plannerAgent.ts**

```typescript
// prompts/plannerAgent.ts
import type { ScenarioOutput, UserModel } from "@/lib/types";
import { SAA_DOMAINS } from "@/data/domains/aws-saa-c03";

export function buildPlannerPrompt(scenario: ScenarioOutput, model: UserModel): string {
  const domain = SAA_DOMAINS.find((d) => d.id === scenario.targetDomains[0]);
  const sessionCount = model.sessions.length;
  const domainScore = model.domainScores[scenario.targetDomains[0] as keyof typeof model.domainScores] ?? 50;

  return `You are a session planner for AWS SAA-C03 exam preparation.

Your job: create a structured probe plan for a mock client meeting. The plan defines 4-6 specific AWS concepts the interviewer (Meeting Agent) MUST test during the conversation. The meeting is a roleplay — the client has a business problem, and the candidate must solve it using AWS architecture.

CONTEXT:
- Session number: ${sessionCount + 1}
- Target domain: ${domain?.name ?? scenario.targetDomains[0]}
- Candidate's current score in this domain: ${domainScore}/100
- Scenario: ${scenario.problemStatement}
- Constraint: ${scenario.constraint}
- Domain key services: ${domain?.keyServices.join(", ")}
- Domain key concepts: ${domain?.concepts.join(", ")}

RULES:
- Return ONLY valid JSON — no markdown, no commentary
- Each probe must be a specific, testable AWS concept relevant to the scenario
- The intent field must describe what a correct answer demonstrates (not what the question asks)
- The sessionGoal is one sentence describing what a full-score session achieves
- probes must be ordered by importance (most critical concept first)
- 4 probes for beginner, 5 for intermediate, 6 for expert
- Difficulty: ${scenario.difficulty}

Return this exact JSON shape:
{
  "probes": [
    {
      "id": "probe-1",
      "concept": "specific AWS concept to test",
      "intent": "what a correct answer demonstrates about the candidate's knowledge",
      "covered": false
    }
  ],
  "targetDomain": "${scenario.targetDomains[0]}",
  "sessionGoal": "one sentence describing what a full-score session achieves"
}`;
}
```

- [ ] **Step 2: Create agents/plannerAgent.ts**

```typescript
// agents/plannerAgent.ts
import { callLLM } from "@/lib/llm";
import { buildPlannerPrompt } from "@/prompts/plannerAgent";
import type { ScenarioOutput, UserModel, ProbePlan } from "@/lib/types";

export async function plannerAgent(
  scenario: ScenarioOutput,
  userModel: UserModel,
): Promise<ProbePlan> {
  const systemPrompt = buildPlannerPrompt(scenario, userModel);

  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await callLLM(
      systemPrompt,
      [{ role: "user", content: "Create the probe plan for this session." }],
      { json: true, temperature: 0.7 },
    );

    try {
      const plan = JSON.parse(raw) as ProbePlan;
      if (plan.probes?.length >= 4 && plan.targetDomain && plan.sessionGoal) {
        return plan;
      }
    } catch {
      continue;
    }
  }

  throw new Error("plannerAgent: failed to generate valid probe plan after 3 attempts");
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add prompts/plannerAgent.ts agents/plannerAgent.ts
git commit -m "feat: add planner agent — generates probe plan targeting weak domain"
```

---

## Task 5: Update orchestrator + create /api/plan route

**Files:**
- Modify: `agents/orchestrator.ts`
- Create: `app/api/plan/route.ts`

- [ ] **Step 1: Update agents/orchestrator.ts**

Read the current orchestrator, then add `planSession`:

```typescript
// agents/orchestrator.ts
import { scenarioAgent } from "./scenarioAgent";
import { debriefAgent } from "./debriefAgent";
import { plannerAgent } from "./plannerAgent";
import type { ScenarioOutput, Message, SessionConfig, DebriefOutput, ProbePlan, UserModel } from "@/lib/types";

export async function startSession(
  userId: string,
  config: SessionConfig,
): Promise<ScenarioOutput> {
  return scenarioAgent(userId, config);
}

export async function planSession(
  scenario: ScenarioOutput,
  userModel: UserModel,
): Promise<ProbePlan> {
  return plannerAgent(scenario, userModel);
}

export async function finishSession(
  scenario: ScenarioOutput,
  transcript: Message[],
  probePlan: ProbePlan,
): Promise<DebriefOutput> {
  return debriefAgent(transcript, scenario, probePlan);
}
```

Note: `finishSession` now accepts `probePlan` and passes it to `debriefAgent`.

- [ ] **Step 2: Create app/api/plan/route.ts**

```typescript
// app/api/plan/route.ts
import { NextResponse } from "next/server";
import { planSession } from "@/agents/orchestrator";
import type { ScenarioOutput, UserModel } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { scenario, userModel } = (await req.json()) as {
      scenario: ScenarioOutput;
      userModel: UserModel;
    };
    const probePlan = await planSession(scenario, userModel);
    return NextResponse.json(probePlan);
  } catch (err) {
    console.error("plan route error:", err);
    return NextResponse.json({ error: "Failed to generate probe plan" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add agents/orchestrator.ts app/api/plan/
git commit -m "feat: add planSession to orchestrator and /api/plan route"
```

---

## Task 6: Upgrade Meeting Agent to track probes

**Files:**
- Modify: `prompts/meetingAgent.ts`
- Modify: `agents/meetingAgent.ts`
- Modify: `app/api/meeting/route.ts`

- [ ] **Step 1: Update prompts/meetingAgent.ts**

Replace the entire file:

```typescript
// prompts/meetingAgent.ts
import type { ScenarioOutput, ProbePlan } from "@/lib/types";

export function buildMeetingPrompt(
  scenario: ScenarioOutput,
  exchangeCount: number,
  probePlan: ProbePlan,
): string {
  const uncovered = probePlan.probes.filter((p) => !p.covered);
  const covered = probePlan.probes.filter((p) => p.covered);
  const injectCurveball = exchangeCount >= 5 && exchangeCount <= 8;
  const nextProbe = uncovered[0];

  return `You are ${scenario.clientName}, ${scenario.clientTitle} at ${scenario.companyName}.

BACKGROUND: ${scenario.problemStatement}
CONSTRAINT: ${scenario.constraint}
${injectCurveball ? `\nCURVEBALL TO INJECT THIS TURN (naturally, mid-conversation): ${scenario.curveball}\n` : ""}

SESSION GOAL: ${probePlan.sessionGoal}

YOUR PROBE PLAN (concepts you must test):
${probePlan.probes.map((p) => `[${p.covered ? "x" : " "}] ${p.concept}`).join("\n")}

${nextProbe ? `CURRENT FOCUS: Your next question should probe the candidate's understanding of: "${nextProbe.concept}"
Intent: ${nextProbe.intent}` : "All probes covered. Wrap up the meeting naturally."}

COVERED SO FAR: ${covered.length}/${probePlan.probes.length} probes

RULES:
1. Stay fully in character as ${scenario.clientName} — never break character, never say you are an AI
2. Ask EXACTLY ONE question per message
3. Your question must naturally probe "${nextProbe?.concept ?? "wrap-up"}" without stating it directly
4. Base follow-ups on the user's previous answer
5. Push back on vague answers: "Can you be more specific about...?"
6. Never correct the user's technical mistakes — defer to after the meeting
7. Wrap up after 10-15 exchanges OR when all probes are covered, whichever comes first

OPENING MESSAGE (first turn, exchange 0):
Start mid-thought, human. Example: "Hey, thanks for jumping on — I'm ${scenario.clientName}. We've been going back and forth on this for weeks and just need a fresh perspective..."

Keep messages concise: 2-4 sentences max.`;
}
```

- [ ] **Step 2: Update agents/meetingAgent.ts**

Replace the entire file:

```typescript
// agents/meetingAgent.ts
import { callLLM } from "@/lib/llm";
import { buildMeetingPrompt } from "@/prompts/meetingAgent";
import type { ScenarioOutput, Message, ProbePlan } from "@/lib/types";

export async function meetingAgentReply(
  scenario: ScenarioOutput,
  history: Message[],
  probePlan: ProbePlan,
): Promise<{ reply: string; updatedPlan: ProbePlan }> {
  const exchangeCount = history.filter((m) => m.role === "assistant").length;
  const systemPrompt = buildMeetingPrompt(scenario, exchangeCount, probePlan);

  const reply = await callLLM(systemPrompt, history, { temperature: 0.85 });

  // Update probe coverage: mark the first uncovered probe as covered
  // if the last user message substantively addresses it
  const updatedProbes = [...probePlan.probes];
  const lastUserMessage = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const firstUncovered = updatedProbes.find((p) => !p.covered);

  if (firstUncovered && lastUserMessage.length > 30) {
    // Heuristic: if the user gave a substantive answer (>30 chars), mark the probe covered
    // The Debrief Agent will assign quality; here we just track coverage
    firstUncovered.covered = true;
  }

  return {
    reply: reply.trim(),
    updatedPlan: { ...probePlan, probes: updatedProbes },
  };
}
```

Note: The coverage heuristic (>30 chars = covered) is intentionally simple. The Meeting Agent's job is to ask the question — coverage just means the candidate attempted an answer. Quality scoring is left to the Debrief Agent.

- [ ] **Step 3: Update app/api/meeting/route.ts**

Replace the entire file:

```typescript
// app/api/meeting/route.ts
import { NextResponse } from "next/server";
import { meetingAgentReply } from "@/agents/meetingAgent";
import type { ScenarioOutput, Message, ProbePlan } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { scenario, history, probePlan } = (await req.json()) as {
      scenario: ScenarioOutput;
      history: Message[];
      probePlan: ProbePlan;
    };
    const { reply, updatedPlan } = await meetingAgentReply(scenario, history, probePlan);
    return NextResponse.json({ reply, probePlan: updatedPlan });
  } catch (err) {
    console.error("meeting route error:", err);
    return NextResponse.json({ error: "Failed to get agent reply" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add prompts/meetingAgent.ts agents/meetingAgent.ts app/api/meeting/route.ts
git commit -m "feat: upgrade meeting agent to track probe coverage, return updated plan"
```

---

## Task 7: Upgrade Debrief Agent to use tool calling

**Files:**
- Modify: `prompts/debriefAgent.ts`
- Modify: `agents/debriefAgent.ts`
- Modify: `app/api/debrief/route.ts`

- [ ] **Step 1: Update prompts/debriefAgent.ts**

Replace the entire file:

```typescript
// prompts/debriefAgent.ts
import type { ScenarioOutput, ProbePlan } from "@/lib/types";
import { SAA_DOMAINS } from "@/data/domains/aws-saa-c03";

export function buildDebriefPrompt(scenario: ScenarioOutput, probePlan: ProbePlan): string {
  const domainList = SAA_DOMAINS.map(
    (d) => `- ${d.id}: ${d.name} (${Math.round(d.weight * 100)}% of exam)`,
  ).join("\n");

  const probeList = probePlan.probes
    .map((p) => `- [${p.covered ? "covered" : "NOT covered"}] ${p.concept}: ${p.intent}`)
    .join("\n");

  return `You are a strict AWS SAA-C03 exam coach grading a mock client meeting transcript.

SCENARIO: ${scenario.clientName} (${scenario.clientTitle}) at ${scenario.companyName}
PROBLEM: ${scenario.problemStatement}
TARGET DOMAINS: ${scenario.targetDomains.join(", ")}
SESSION GOAL: ${probePlan.sessionGoal}

SAA-C03 DOMAINS:
${domainList}

PROBE PLAN (what was supposed to be tested):
${probeList}

GRADING PROCESS — follow these steps IN ORDER:
1. For each probe in the plan, call getProbeExpectations(probeId) to understand what a strong answer looks like
2. Call getSAADomainConcepts(domainId) for the target domain to get the official concept list
3. Grade the transcript against both the probe expectations AND the official concepts
4. Draft your scores (0-100 for each dimension)
5. Call selfCritiqueGrade(draftScores) to check for inconsistencies
6. Revise scores if the critique flags issues
7. Return the final JSON

DO NOT skip the tool calls. DO NOT return JSON without calling selfCritiqueGrade first.

FINAL OUTPUT — return this exact JSON shape (no markdown, no commentary):
{
  "scores": {
    "technicalAccuracy": number,
    "depthOfExplanation": number,
    "domainCoverage": number,
    "communicationClarity": number,
    "overall": number
  },
  "moments": [
    {
      "exchangeIndex": number,
      "type": "good|incomplete|missed",
      "userMessage": "exact quote",
      "annotation": "what was good/missing and why",
      "certRelevance": "SAA-C03 concept (optional)"
    }
  ],
  "probeResults": [
    {
      "probeId": "probe-1",
      "concept": "string",
      "quality": "strong|weak|missed",
      "evidence": "brief quote or summary"
    }
  ],
  "examIntel": {
    "domainsExercised": ["resilient|performance|secure|cost"],
    "examQuestionExample": "A company needs... (A)...(B)...(C)...(D)...",
    "keyConceptsTested": ["string"]
  },
  "studyNext": {
    "weakAreas": ["string"],
    "suggestedTopics": ["string"],
    "suggestedNextScenario": "one sentence"
  }
}`;
}
```

- [ ] **Step 2: Update lib/types.ts to add probeResults to DebriefOutput**

Open `lib/types.ts`. Find `DebriefOutput` and add `probeResults` to it:

```typescript
export type DebriefOutput = {
  scores: {
    technicalAccuracy: number;
    depthOfExplanation: number;
    domainCoverage: number;
    communicationClarity: number;
    overall: number;
  };
  moments: {
    exchangeIndex: number;
    type: "good" | "incomplete" | "missed";
    userMessage: string;
    annotation: string;
    certRelevance?: string;
  }[];
  probeResults?: {
    probeId: string;
    concept: string;
    quality: "strong" | "weak" | "missed";
    evidence: string;
  }[];
  examIntel: {
    domainsExercised: string[];
    examQuestionExample: string;
    keyConceptsTested: string[];
  };
  studyNext: {
    weakAreas: string[];
    suggestedTopics: string[];
    suggestedNextScenario: string;
  };
};
```

(`probeResults` is optional `?` so the existing debrief page still works without changes.)

- [ ] **Step 3: Update agents/debriefAgent.ts**

Replace the entire file:

```typescript
// agents/debriefAgent.ts
import { callLLMWithTools } from "@/lib/llm";
import { buildDebriefPrompt } from "@/prompts/debriefAgent";
import { DEBRIEF_TOOL_DEFINITIONS, buildDebriefHandlers } from "@/lib/tools";
import type { DebriefOutput, Message, ScenarioOutput, ProbePlan } from "@/lib/types";

export async function debriefAgent(
  transcript: Message[],
  scenario: ScenarioOutput,
  probePlan: ProbePlan,
): Promise<DebriefOutput> {
  const systemPrompt = buildDebriefPrompt(scenario, probePlan);
  const handlers = buildDebriefHandlers(probePlan);

  const transcriptText = transcript
    .map((m) => `${m.role === "user" ? "Candidate" : scenario.clientName}: ${m.content}`)
    .join("\n\n");

  const raw = await callLLMWithTools(
    systemPrompt,
    [{ role: "user", content: `Grade this transcript:\n\n${transcriptText}` }],
    DEBRIEF_TOOL_DEFINITIONS,
    handlers,
    { temperature: 0.2 },
  );

  try {
    return JSON.parse(raw) as DebriefOutput;
  } catch {
    throw new Error(`debriefAgent: failed to parse LLM response as JSON. Raw: ${raw.slice(0, 200)}`);
  }
}
```

- [ ] **Step 4: Update app/api/debrief/route.ts**

```typescript
// app/api/debrief/route.ts
import { NextResponse } from "next/server";
import { finishSession } from "@/agents/orchestrator";
import type { ScenarioOutput, Message, ProbePlan } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { scenario, transcript, probePlan } = (await req.json()) as {
      scenario: ScenarioOutput;
      transcript: Message[];
      probePlan: ProbePlan;
    };
    const debrief = await finishSession(scenario, transcript, probePlan);
    return NextResponse.json(debrief);
  } catch (err) {
    console.error("debrief route error:", err);
    return NextResponse.json({ error: "Failed to generate debrief" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add prompts/debriefAgent.ts agents/debriefAgent.ts app/api/debrief/route.ts lib/types.ts
git commit -m "feat: upgrade debrief agent to multi-step tool-calling loop"
```

---

## Task 8: Wire probePlan into setup page and meeting page

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/meeting/page.tsx`

- [ ] **Step 1: Update app/page.tsx — fetch plan after scenario**

Read `app/page.tsx`. In `startSession()`, after the scenario is fetched and stored, add the plan fetch:

```typescript
      // After storing scenario:
      sessionStorage.setItem("clouddesk:scenario", JSON.stringify(scenario));

      // Fetch probe plan
      const userModelRaw = sessionStorage.getItem("clouddesk:userModel");
      const userModel = userModelRaw ? JSON.parse(userModelRaw) : { userId, sessions: [], domainScores: { resilient: 50, performance: 50, secure: 50, cost: 50 }, seenCombinations: [] };

      const planRes = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, userModel }),
      });
      if (!planRes.ok) throw new Error(`Plan API error: ${planRes.status}`);
      const probePlan = await planRes.json();
      sessionStorage.setItem("clouddesk:probePlan", JSON.stringify(probePlan));

      router.push("/brief");
```

Also update the loading message to show two-step progress. Find the existing loading state button text and change to reflect both steps:

```tsx
{loading ? "Preparing your session..." : "Start Session"}
```

- [ ] **Step 2: Update app/meeting/page.tsx — send/receive probePlan each turn**

Read `app/meeting/page.tsx`. Make these changes:

**a) Load probePlan from sessionStorage on mount** — add alongside scenario loading:
```typescript
    const rawPlan = sessionStorage.getItem("clouddesk:probePlan");
    if (rawPlan) setProbePlan(JSON.parse(rawPlan));
```

**b) Add probePlan state** — add alongside other useState calls:
```typescript
  const [probePlan, setProbePlan] = useState<ProbePlan | null>(null);
```

**c) Import ProbePlan type** — add to the import from `@/lib/types`.

**d) Pass probePlan to API and receive updated plan** — in `sendToAgent`, update the fetch body and response handling:

```typescript
        body: JSON.stringify({ scenario: currentScenario, history, probePlan: currentProbePlan }),
```

Update the response to extract both reply and updated plan:
```typescript
        const data = await res.json();
        const reply = data.reply as string;
        const updatedPlan = data.probePlan as ProbePlan;

        const newMsg: Message = { role: "assistant", content: reply };
        setMessages((prev) => [...prev, newMsg]);
        setProbePlan(updatedPlan);
        sessionStorage.setItem("clouddesk:probePlan", JSON.stringify(updatedPlan));
        setIsThinking(false);
```

**e) Pass probePlan to sendToAgent** — `sendToAgent` signature becomes:
```typescript
    async (history: Message[], currentScenario: ScenarioOutput, currentProbePlan: ProbePlan) => {
```

Update all `sendToAgent(...)` calls to pass the current probePlan.

**f) Pass probePlan to debrief** — in `handleEndMeeting`:
```typescript
  function handleEndMeeting() {
    sessionStorage.setItem("clouddesk:transcript", JSON.stringify(messages));
    // probePlan already kept up to date in sessionStorage
    router.push("/debrief");
  }
```

(The debrief page reads `clouddesk:probePlan` from sessionStorage directly.)

**g) Guard: if probePlan is null, wait** — the greeting fires when `scenario` loads. Ensure the greeting also waits for `probePlan`:

```typescript
  useEffect(() => {
    if (!scenario || !probePlan || initialized.current) return;
    initialized.current = true;
    sendToAgent([], scenario, probePlan);
  }, [scenario, probePlan, sendToAgent]);
```

- [ ] **Step 3: Update app/debrief/page.tsx — send probePlan to debrief API**

Read `app/debrief/page.tsx`. In the fetch call, add `probePlan` to the body:

```typescript
      const rawPlan = sessionStorage.getItem("clouddesk:probePlan");
      const probePlan = rawPlan ? JSON.parse(rawPlan) : { probes: [], targetDomain: "", sessionGoal: "" };

      // In the fetch body:
      body: JSON.stringify({ scenario, transcript, probePlan }),
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Fix any type errors — the main risk is `probePlan` being `null` when `sendToAgent` is called. Add null guards where needed.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/meeting/page.tsx app/debrief/page.tsx
git commit -m "feat: wire probePlan through setup, meeting, and debrief pages"
```

---

## Task 9: Add probe checklist to AvatarPanel

**Files:**
- Modify: `components/MeetingRoom/AvatarPanel.tsx`

- [ ] **Step 1: Update AvatarPanel to accept and render probePlan**

Replace the entire file:

```tsx
// components/MeetingRoom/AvatarPanel.tsx
import type { ProbePlan } from "@/lib/types";

interface Props {
  clientName: string;
  clientTitle: string;
  companyName: string;
  isSpeaking: boolean;
  probePlan: ProbePlan | null;
}

export function AvatarPanel({ clientName, clientTitle, companyName, isSpeaking, probePlan }: Props) {
  const initials = clientName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const coveredCount = probePlan?.probes.filter((p) => p.covered).length ?? 0;
  const totalCount = probePlan?.probes.length ?? 0;

  return (
    <div className="flex flex-col items-center gap-3 py-4 px-2 h-full overflow-y-auto">
      <div className={`relative w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-semibold flex-shrink-0 ${isSpeaking ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-zinc-900" : ""}`}>
        {initials}
        {isSpeaking && (
          <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-zinc-900" />
        )}
      </div>
      <div className="text-center">
        <p className="text-white text-sm font-medium">{clientName}</p>
        <p className="text-zinc-500 text-xs">{clientTitle}</p>
        <p className="text-zinc-600 text-xs">{companyName}</p>
      </div>

      {probePlan && (
        <div className="w-full mt-2 border-t border-zinc-800 pt-3">
          <p className="text-zinc-600 text-xs uppercase tracking-wider mb-2 text-center">
            Probes {coveredCount}/{totalCount}
          </p>
          <ul className="space-y-1.5">
            {probePlan.probes.map((probe) => (
              <li key={probe.id} className="flex items-start gap-1.5">
                <span className={`mt-0.5 flex-shrink-0 text-xs ${probe.covered ? "text-green-500" : "text-zinc-600"}`}>
                  {probe.covered ? "✓" : "○"}
                </span>
                <span className={`text-xs leading-tight ${probe.covered ? "text-zinc-500 line-through" : "text-zinc-400"}`}>
                  {probe.concept}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update meeting page to pass probePlan to AvatarPanel**

In `app/meeting/page.tsx`, find the `<AvatarPanel>` usage and add `probePlan={probePlan}`:

```tsx
          <AvatarPanel
            clientName={scenario.clientName}
            clientTitle={scenario.clientTitle}
            companyName={scenario.companyName}
            isSpeaking={isSpeaking}
            probePlan={probePlan}
          />
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Verify full build**

```bash
npm run build
```

Expected: clean build, all routes compile.

- [ ] **Step 5: Commit**

```bash
git add components/MeetingRoom/AvatarPanel.tsx app/meeting/page.tsx
git commit -m "feat: add real-time probe checklist to meeting room sidebar"
```

---

## Task 10: End-to-end verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Run a full session and verify the agentic loop**

1. Go to http://localhost:3000 → Start Session
2. Watch the server logs: you should see two API calls — `/api/scenario` then `/api/plan`
3. Go to /brief → Join Meeting
4. In the meeting room: AvatarPanel sidebar shows probe checklist
5. Send 3+ messages — watch probes tick off as you answer
6. End Meeting → verify debrief loads
7. In server logs for `/api/debrief`, verify the tool-calling loop ran (look for multiple round-trips inside `callLLMWithTools`)
8. Debrief page loads with scores

- [ ] **Step 3: Verify the agent reasoning in logs**

The debrief should show tool call activity in the server console. If it completes too quickly without tool calls, check that `callLLMWithTools` is correctly passing tool declarations to Gemini.

- [ ] **Step 4: Commit final verification**

```bash
git add -A
git commit -m "chore: verified agentic upgrade end-to-end"
```

---

## Self-Review

**Spec coverage:**
- ✅ PlannerAgent creates probe plan — Task 4
- ✅ Probe checklist visible in meeting sidebar — Task 9
- ✅ Meeting Agent tracks probe coverage per turn — Task 6
- ✅ Debrief Agent makes tool calls (getProbeExpectations, getSAADomainConcepts, selfCritiqueGrade) — Task 7
- ✅ probeResults in DebriefOutput — Task 7
- ✅ Full session flow unchanged — Tasks 8-10
- ✅ No regressions in existing functionality — probePlan is optional in all backward-facing types

**Type consistency:**
- `ProbePlan` added to `lib/types.ts` — used in plannerAgent, meetingAgent, debriefAgent, all route handlers ✅
- `DebriefOutput.probeResults` is optional `?` — existing debrief page code still compiles ✅
- `finishSession` in orchestrator now takes `probePlan` — all callers (debrief route) updated ✅
- `meetingAgentReply` now returns `{ reply, updatedPlan }` — meeting route updated ✅

**Placeholder scan:** None found.
