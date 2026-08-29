# Multi-Role Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Senior Developer and Team Lead roles with free counterpart selection (client / non-tech / junior-dev / team-engineer) so the scenario and meeting agents calibrate depth, tone, and persona accordingly.

**Architecture:** `counterpartRole` is added to both `SessionConfig` (user picks it) and `ScenarioOutput` (agent echoes it back). The scenario prompt receives `role` + `counterpartRole` to calibrate question depth. The meeting prompt reads `scenario.counterpartRole` to switch persona and opening style. No debrief, orchestrator, API route, or user model changes needed.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, existing Vercel AI SDK adapter.

---

## File Map

| File | Change |
|---|---|
| `lib/types.ts` | Add `"team-lead"` to role union; add `counterpartRole` to `SessionConfig` and `ScenarioOutput` |
| `prompts/scenarioAgent.ts` | `buildScenarioPrompt(role, counterpartRole)` — inject role definition + counterpart definition |
| `agents/scenarioAgent.ts` | Pass `config.role`, `config.counterpartRole` to `buildScenarioPrompt` |
| `prompts/meetingAgent.ts` | Add counterpart-aware persona block + opening style |
| `app/page.tsx` | Add role picker + counterpart picker UI |
| `components/Brief/BriefCard.tsx` | Counterpart-aware label for the client section |

---

## Task 1: Update `lib/types.ts`

**Files:**
- Modify: `lib/types.ts`

Add `"team-lead"` to the `role` union in `SessionConfig`. Add `counterpartRole` to both `SessionConfig` and `ScenarioOutput`.

- [ ] **Step 1: Replace `SessionConfig` and `ScenarioOutput` in `lib/types.ts`**

Find `SessionConfig` (currently lines 4–8) and replace it:

```typescript
export type SessionConfig = {
  userId: string;
  role: "solutions-architect" | "senior-developer" | "team-lead";
  counterpartRole: "client" | "non-tech" | "junior-dev" | "team-engineer";
  difficulty: "beginner" | "intermediate" | "expert";
};
```

Find `ScenarioOutput` (currently lines 10–22) and add `counterpartRole` as the last field before the closing brace:

```typescript
export type ScenarioOutput = {
  clientName: string;
  clientTitle: string;
  companyName: string;
  industry: string;
  problemStatement: string;
  constraint: string;
  targetDomains: string[];
  curveball: string;
  difficulty: "beginner" | "intermediate" | "expert";
  tip?: string;
  voiceId: string;
  counterpartRole: "client" | "non-tech" | "junior-dev" | "team-engineer";
};
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: errors about `app/page.tsx` missing `counterpartRole` in the config object, and `agents/scenarioAgent.ts` calling `buildScenarioPrompt()` with no args when it will soon require args. These are cascade errors that will be fixed in later tasks. Any OTHER errors fix now.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add team-lead role and counterpartRole to SessionConfig and ScenarioOutput"
```

---

## Task 2: Update `prompts/scenarioAgent.ts`

**Files:**
- Modify: `prompts/scenarioAgent.ts`

`buildScenarioPrompt` receives `role` and `counterpartRole`. It injects the role definition (what depth of knowledge is expected), the counterpart definition (who the user is talking to), and adds `counterpartRole` to the JSON schema.

- [ ] **Step 1: Replace the entire file**

```typescript
import { SAA_DOMAINS } from "@/data/domains/aws-saa-c03";
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
): string {
  const domainList = SAA_DOMAINS.map(
    (d) => `- ${d.id}: ${d.name} (key services: ${d.keyServices.join(", ")}; concepts: ${d.concepts.join(", ")})`
  ).join("\n");

  return `You are a scenario generator for AWS Solutions Architect Associate (SAA-C03) exam prep.

USER ROLE: ${ROLE_DEFINITIONS[role]}

COUNTERPART: ${COUNTERPART_DEFINITIONS[counterpartRole]}

You have access to three tools. Use them in this order:
1. Call readDomainScores — identify the domain with the lowest score (that is the weakest domain)
2. Call listSeenCombinations — note which industry:problem combinations to avoid
3. Generate a scenario JSON targeting the weakest domain, calibrated for the user role and counterpart above
4. Call validateScenario — pass your targetDomains, problemStatement, and the weakest domain ID
5. If validateScenario returns valid: false, fix the issue and call validateScenario again
6. Once validateScenario returns valid: true, output the final scenario JSON

SCENARIO RULES:
- Return ONLY valid JSON matching the schema below — no markdown, no commentary
- The problemStatement describes the situation from the COUNTERPART's perspective — what they need or don't understand
- Never mention AWS services or technical solutions in problemStatement
- The curveball is a mid-conversation complication; keep it in character for the counterpart
- The industry and problem must NOT match any previously seen combination
- targetDomains must include the weakest domain and may include 1–2 others
- voiceId must be one of: af_sarah, af_bella, am_adam, am_michael
- counterpartRole in the JSON must exactly match: ${counterpartRole}
- clientName and clientTitle should be appropriate for the counterpart type:
  - client: business stakeholder name and title at a company
  - non-tech: a person with a non-technical title (e.g. "Writer", "Teacher", "Product Manager")
  - junior-dev: a junior developer name and title at a company
  - team-engineer: a senior/staff engineer name and title at a company

SAA-C03 DOMAINS:
${domainList}

Return this exact JSON shape:
{
  "clientName": "string",
  "clientTitle": "string",
  "companyName": "string",
  "industry": "string",
  "problemStatement": "string (2-3 sentences from the counterpart's perspective — no AWS service names)",
  "constraint": "string (one constraint relevant to the counterpart type)",
  "targetDomains": ["string — domain IDs"],
  "curveball": "string (one sentence complication in character for the counterpart)",
  "difficulty": "beginner|intermediate|expert",
  "tip": "string or null (beginner only — one actionable hint for the user)",
  "voiceId": "af_sarah|af_bella|am_adam|am_michael",
  "counterpartRole": "${counterpartRole}"
}`;
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: same cascade errors as Task 1 (page.tsx missing counterpartRole, scenarioAgent.ts calling buildScenarioPrompt with wrong args). No new errors.

- [ ] **Step 3: Commit**

```bash
git add prompts/scenarioAgent.ts
git commit -m "feat: buildScenarioPrompt accepts role and counterpartRole, injects definitions"
```

---

## Task 3: Update `agents/scenarioAgent.ts`

**Files:**
- Modify: `agents/scenarioAgent.ts`

Pass `config.role` and `config.counterpartRole` into `buildScenarioPrompt`. Also update the user message to include role context.

- [ ] **Step 1: Replace the entire file**

```typescript
import { callLLMWithTools } from "@/lib/llm";
import { buildScenarioPrompt } from "@/prompts/scenarioAgent";
import type { ScenarioOutput, SessionConfig, UserModel } from "@/lib/types";

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function scenarioAgent(
  config: SessionConfig,
  userModel: UserModel,
): Promise<ScenarioOutput> {
  const systemPrompt = buildScenarioPrompt(config.role, config.counterpartRole);

  const raw = await callLLMWithTools(
    systemPrompt,
    [{
      role: "user",
      content: `Generate a ${config.difficulty} scenario for a ${config.role} talking to a ${config.counterpartRole}.`,
    }],
    userModel,
    { temperature: 0.9 },
  );

  try {
    return JSON.parse(stripFences(raw)) as ScenarioOutput;
  } catch {
    throw new Error(`scenarioAgent: failed to parse LLM response as JSON. Raw: ${raw.slice(0, 500)}`);
  }
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: only the `app/page.tsx` cascade error about missing `counterpartRole` in config. No other errors.

- [ ] **Step 3: Commit**

```bash
git add agents/scenarioAgent.ts
git commit -m "feat: scenarioAgent passes role and counterpartRole to prompt builder"
```

---

## Task 4: Update `prompts/meetingAgent.ts`

**Files:**
- Modify: `prompts/meetingAgent.ts`

Add a counterpart-aware persona block and opening style. The function signature is unchanged — it already receives `ScenarioOutput` which now has `counterpartRole`.

- [ ] **Step 1: Replace the entire file**

```typescript
import type { ScenarioOutput } from "@/lib/types";

const COUNTERPART_PERSONA: Record<NonNullable<ScenarioOutput["counterpartRole"]>, string> = {
  client:
    "You are a business stakeholder. You care about outcomes, timelines, costs, and risk — not technical implementation. Push back if something sounds too expensive or risky. Ask for business justification.",
  "non-tech":
    "You have no technical background. When the user uses jargon or cloud service names, ask what they mean in plain terms. Say things like 'I don't know what that means — can you explain it differently?' Challenge them to explain without buzzwords. Be curious and engaged but genuinely confused by technical terms.",
  "junior-dev":
    "You are a junior developer eager to learn. Ask 'why' questions. Admit when you don't fully understand something — 'wait, why would we do it that way instead of X?' Defer to the user's expertise but keep asking for clarification until it makes sense to you.",
  "team-engineer":
    "You are a capable senior engineer. Challenge design decisions technically. Suggest alternatives — 'couldn't we just use X instead?' Push back if something sounds over-engineered or if there's a simpler path. Don't accept vague answers.",
};

const OPENING_STYLE: Record<NonNullable<ScenarioOutput["counterpartRole"]>, string> = {
  client: `Start mid-thought, human, no greeting formalities. Example: "Hey, thanks for jumping on — I'm [name]. We've been going back and forth on this for weeks and honestly just need a fresh perspective..."`,
  "non-tech": `Start with casual curiosity, slightly self-deprecating. Example: "Hey, I hope this isn't too basic a question — I've been trying to understand how all this cloud stuff actually works and someone said you'd be the right person to ask..."`,
  "junior-dev": `Start like a colleague catching you in the hallway. Example: "Hey, got a sec? I'm working on [X] and I'm a bit stuck — do you mind if I walk through it with you?"`,
  "team-engineer": `Start with a direct technical challenge. Example: "Before we lock in this design, I want to push back on [X] a bit — have we seriously considered just doing [Y] instead?"`,
};

export function buildMeetingPrompt(scenario: ScenarioOutput, exchangeCount: number): string {
  const injectCurveball = exchangeCount >= 5 && exchangeCount <= 8;
  const counterpart = scenario.counterpartRole ?? "client";

  return `You are ${scenario.clientName}, ${scenario.clientTitle}${scenario.companyName ? ` at ${scenario.companyName}` : ""}.

PERSONA: ${COUNTERPART_PERSONA[counterpart]}

BACKGROUND: ${scenario.problemStatement}
CONSTRAINT: ${scenario.constraint}
${injectCurveball ? `\nCURVEBALL TO INJECT THIS TURN (naturally, mid-conversation): ${scenario.curveball}\n` : ""}

RULES — follow these exactly:
1. Stay fully in character — never break character, never say you are an AI
2. Ask EXACTLY ONE question per message — never stack questions
3. Base each follow-up on the user's previous answer
4. If the user's answer is vague or buzzword-heavy, push back in character
5. Never correct the user's technical mistakes — defer everything to after the meeting
6. Wrap up naturally after 10–15 total exchanges, or when the user signals they're done

OPENING MESSAGE STYLE (first turn only):
${OPENING_STYLE[counterpart]}

Keep messages concise: 2–4 sentences max.`;
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: only the `app/page.tsx` cascade error. No other errors.

- [ ] **Step 3: Commit**

```bash
git add prompts/meetingAgent.ts
git commit -m "feat: meeting prompt uses counterpartRole for persona and opening style"
```

---

## Task 5: Update `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

Add role picker and counterpart picker. Wire both into `SessionConfig`. Remove the hardcoded `role: "solutions-architect"` and the hardcoded description at the bottom.

- [ ] **Step 1: Replace the entire file**

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { SessionConfig } from "@/lib/types";

const ROLES: { value: SessionConfig["role"]; label: string; desc: string }[] = [
  { value: "solutions-architect", label: "Solutions Architect", desc: "End-to-end cloud system design" },
  { value: "senior-developer", label: "Senior Developer", desc: "Implementation depth, APIs, and debugging" },
  { value: "team-lead", label: "Team Lead", desc: "Architectural decisions and technical communication" },
];

const COUNTERPARTS: { value: SessionConfig["counterpartRole"]; label: string; desc: string }[] = [
  { value: "client", label: "Client", desc: "Business stakeholder, outcome-focused" },
  { value: "non-tech", label: "Non-Technical", desc: "Curious layperson, explain without jargon" },
  { value: "junior-dev", label: "Junior Dev", desc: "Junior developer, teach and mentor" },
  { value: "team-engineer", label: "Team Engineer", desc: "Senior engineer, defend your decisions" },
];

const DIFFICULTIES: { value: SessionConfig["difficulty"]; label: string; desc: string }[] = [
  { value: "beginner", label: "Beginner", desc: "Tips enabled, gentler conversation" },
  { value: "intermediate", label: "Intermediate", desc: "No tips, realistic pushback" },
  { value: "expert", label: "Expert", desc: "Skeptical counterpart, complex constraints" },
];

export default function SetupPage() {
  const router = useRouter();
  const [role, setRole] = useState<SessionConfig["role"]>("solutions-architect");
  const [counterpartRole, setCounterpartRole] = useState<SessionConfig["counterpartRole"]>("client");
  const [difficulty, setDifficulty] = useState<SessionConfig["difficulty"]>("intermediate");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSession() {
    setLoading(true);
    setError(null);
    const userId = sessionStorage.getItem("clouddesk:userId") ?? `user-${Date.now()}`;
    const config: SessionConfig = {
      userId,
      role,
      counterpartRole,
      difficulty,
    };

    sessionStorage.setItem("clouddesk:config", JSON.stringify(config));
    sessionStorage.setItem("clouddesk:userId", userId);

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

  function SelectorGroup<T extends string>({
    label,
    options,
    value,
    onChange,
  }: {
    label: string;
    options: { value: T; label: string; desc: string }[];
    value: T;
    onChange: (v: T) => void;
  }) {
    return (
      <div>
        <p className="text-sm text-zinc-400 mb-3">{label}</p>
        <div className="flex gap-2">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                value === o.value
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          {options.find((o) => o.value === value)?.desc}
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-2xl text-white">CloudDesk</CardTitle>
          <CardDescription className="text-zinc-400">
            Cloud certification prep — simulated conversations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SelectorGroup
            label="Your role"
            options={ROLES}
            value={role}
            onChange={setRole}
          />
          <SelectorGroup
            label="Talking to"
            options={COUNTERPARTS}
            value={counterpartRole}
            onChange={setCounterpartRole}
          />
          <SelectorGroup
            label="Difficulty"
            options={DIFFICULTIES}
            value={difficulty}
            onChange={setDifficulty}
          />
          <Button
            onClick={startSession}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? "Generating scenario..." : "Start Session"}
          </Button>
          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add role and counterpart pickers to setup page"
```

---

## Task 6: Update `components/Brief/BriefCard.tsx`

**Files:**
- Modify: `components/Brief/BriefCard.tsx`

Change the "Your client" label to be counterpart-aware. Use `scenario.counterpartRole` to pick the right label.

- [ ] **Step 1: Replace the counterpart label section only**

Find this block in `BriefCard.tsx`:

```typescript
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Your client</p>
          <h2 className="text-2xl font-semibold text-white">{scenario.clientName}</h2>
          <p className="text-zinc-400">{scenario.clientTitle} · {scenario.companyName}</p>
        </div>
```

Replace it with:

```typescript
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
```

- [ ] **Step 2: Check TypeScript compiles with zero errors**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add components/Brief/BriefCard.tsx
git commit -m "feat: brief card shows counterpart-aware label"
```

---

## Task 7: Build check and smoke test

**Files:** None modified.

- [ ] **Step 1: Production build**

```bash
cd /Users/cmante/Documents/root/clouddesk
npm run build 2>&1 | tail -20
```

Expected: clean build, all routes listed, no errors.

- [ ] **Step 2: Start dev server and smoke test**

```bash
npm run dev
```

Open `http://localhost:3000`. Verify:

1. Setup page shows three role buttons (Solutions Architect, Senior Developer, Team Lead)
2. Setup page shows four counterpart buttons (Client, Non-Technical, Junior Dev, Team Engineer)
3. Difficulty selector still works
4. Select "Senior Developer" + "Junior Dev" + "Intermediate" → click Start Session
5. Brief page loads — verify the label says "You're being asked by" and `clientTitle` looks like a junior developer title
6. Join the meeting — verify the agent's opening message matches the junior dev style ("Hey, got a sec? I'm working on...")
7. Repeat with "Solutions Architect" + "Non-Technical" → verify opening message is the layperson style
8. Repeat with "Team Lead" + "Team Engineer" → verify opening is the technical challenge style

- [ ] **Step 3: No commit needed** — smoke test only.
