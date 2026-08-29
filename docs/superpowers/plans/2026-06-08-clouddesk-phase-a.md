# CloudDesk Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully working multi-agent AWS SAA-C03 cert prep app (setup → brief → meeting → debrief → dashboard) deployed on Vercel with a demonstrable adaptive feedback loop.

**Architecture:** Next.js 15 App Router; three agents run server-side via API routes (`/api/scenario`, `/api/meeting`, `/api/debrief`); all provider logic isolated in `lib/llm.ts` (Gemini) and `lib/speech.ts` (Web Speech API); user state in sessionStorage.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, `@google/genai`, Web Speech API (TTS + STT), Vercel.

---

## File Map

| File | Responsibility |
|---|---|
| `lib/types.ts` | All shared TypeScript types |
| `lib/llm.ts` | `callLLM()` — only file that imports `@google/genai` |
| `lib/speech.ts` | `speak()` / `listen()` — only file that touches Web Speech API |
| `lib/userModel.ts` | `readUserModel()` / `updateUserModel()` — sessionStorage CRUD |
| `data/domains/aws-saa-c03.ts` | SAA_DOMAINS constant |
| `prompts/scenarioAgent.ts` | System prompt for Scenario Agent |
| `prompts/meetingAgent.ts` | System prompt for Meeting Agent |
| `prompts/debriefAgent.ts` | System prompt for Debrief Agent |
| `agents/scenarioAgent.ts` | `scenarioAgent()` function |
| `agents/meetingAgent.ts` | `meetingAgentReply()` function |
| `agents/debriefAgent.ts` | `debriefAgent()` function |
| `agents/orchestrator.ts` | `startSession()` / `finishSession()` |
| `app/api/scenario/route.ts` | POST handler → calls `startSession()` |
| `app/api/meeting/route.ts` | POST handler → calls `meetingAgentReply()` |
| `app/api/debrief/route.ts` | POST handler → calls `finishSession()` |
| `app/page.tsx` | Setup screen (role select + start) |
| `app/brief/page.tsx` | Pre-meeting brief |
| `app/meeting/page.tsx` | Live meeting room |
| `app/debrief/page.tsx` | Graded breakdown |
| `app/dashboard/page.tsx` | Session history + domain scores |
| `components/MeetingRoom/ChatPanel.tsx` | Message list |
| `components/MeetingRoom/AvatarPanel.tsx` | Client avatar + thinking indicator |
| `components/MeetingRoom/InputBar.tsx` | Text input + mic button |
| `components/MeetingRoom/MeetingHeader.tsx` | Timer + end meeting |
| `components/Brief/BriefCard.tsx` | Scenario details card |
| `components/Brief/JoinButton.tsx` | Connecting → fade transition |
| `components/Debrief/ScoreCard.tsx` | Animated scores |
| `components/Debrief/MomentReplay.tsx` | Exchange annotations |
| `components/Debrief/ExamIntel.tsx` | Domain + exam question |
| `components/Debrief/StudyNext.tsx` | Weak areas + next scenario |
| `components/Dashboard/DomainBars.tsx` | Score bars + adaptive callout |
| `components/Dashboard/SessionList.tsx` | Session history list |

---

## Task 1: Scaffold Next.js project

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `.env.local`, `.gitignore`

- [ ] **Step 1: Bootstrap the project**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=no --import-alias="@/*" --yes
```

Expected: Next.js 15 project created with App Router, Tailwind, TypeScript.

- [ ] **Step 2: Install shadcn/ui**

```bash
npx shadcn@latest init -d
```

When prompted, accept defaults (New York style, Zinc base color). This creates `components/ui/` and updates `tailwind.config.ts`.

- [ ] **Step 3: Install Google GenAI SDK**

```bash
npm install @google/genai
```

- [ ] **Step 4: Install shadcn components we'll use**

```bash
npx shadcn@latest add button card badge progress dialog textarea separator
```

- [ ] **Step 5: Create .env.local**

```bash
cat > .env.local << 'EOF'
GEMINI_API_KEY=your_key_here
EOF
```

Add `.env.local` to `.gitignore` (create-next-app does this automatically — verify it's there).

- [ ] **Step 6: Verify dev server starts**

```bash
npm run dev
```

Open http://localhost:3000. Expected: default Next.js welcome page loads without errors.

- [ ] **Step 7: Commit scaffold**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js 15 + shadcn/ui + @google/genai"
```

---

## Task 2: Types and domain data

**Files:**
- Create: `lib/types.ts`
- Create: `data/domains/aws-saa-c03.ts`

- [ ] **Step 1: Create lib/types.ts**

```typescript
// lib/types.ts

export type Message = { role: "user" | "assistant"; content: string };
export type LLMOpts = { temperature?: number; json?: boolean };

export type SessionConfig = {
  userId: string;
  role: "solutions-architect" | "senior-developer";
  difficulty: "beginner" | "intermediate" | "expert";
};

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
};

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

export type DomainScores = {
  resilient: number;
  performance: number;
  secure: number;
  cost: number;
};

export type SessionResult = {
  sessionId: string;
  date: number;
  scenario: ScenarioOutput;
  scores: DebriefOutput["scores"];
  domainsExercised: string[];
};

export type UserModel = {
  userId: string;
  sessions: SessionResult[];
  domainScores: DomainScores;
  seenCombinations: string[];
};
```

- [ ] **Step 2: Create data/domains/aws-saa-c03.ts**

```typescript
// data/domains/aws-saa-c03.ts

export const SAA_DOMAINS = [
  {
    id: "resilient",
    name: "Design Resilient Architectures",
    weight: 0.26,
    keyServices: ["Route 53", "ELB", "Auto Scaling", "Multi-AZ RDS", "S3", "CloudFront"],
    concepts: ["high availability", "fault tolerance", "disaster recovery", "backup strategies"],
  },
  {
    id: "performance",
    name: "Design High-Performing Architectures",
    weight: 0.24,
    keyServices: ["ElastiCache", "CloudFront", "SQS", "SNS", "Lambda", "DynamoDB"],
    concepts: ["caching", "decoupling", "serverless", "read replicas", "horizontal scaling"],
  },
  {
    id: "secure",
    name: "Design Secure Applications and Architectures",
    weight: 0.3,
    keyServices: ["IAM", "KMS", "WAF", "Shield", "Cognito", "Secrets Manager", "VPC"],
    concepts: ["least privilege", "encryption at rest", "encryption in transit", "MFA", "compliance"],
  },
  {
    id: "cost",
    name: "Design Cost-Optimized Architectures",
    weight: 0.2,
    keyServices: ["Cost Explorer", "Trusted Advisor", "Spot Instances", "Reserved Instances", "S3 Intelligent-Tiering"],
    concepts: ["right-sizing", "reserved vs on-demand", "storage tiers", "data transfer costs"],
  },
] as const;

export type DomainId = (typeof SAA_DOMAINS)[number]["id"];
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts data/domains/aws-saa-c03.ts
git commit -m "feat: add shared types and SAA-C03 domain data"
```

---

## Task 3: Adapter layer — LLM and Speech

**Files:**
- Create: `lib/llm.ts`
- Create: `lib/speech.ts`

- [ ] **Step 1: Create lib/llm.ts**

```typescript
// lib/llm.ts
import { GoogleGenAI } from "@google/genai";
import type { Message, LLMOpts } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function callLLM(
  systemPrompt: string,
  messages: Message[],
  opts: LLMOpts = {},
): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: opts.temperature ?? 0.8,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  });
  return response.text ?? "";
}
```

- [ ] **Step 2: Create lib/speech.ts**

```typescript
// lib/speech.ts
// speak() and listen() are browser-only — called from components, never from agents.
// voiceId examples: 'af_sarah', 'am_adam' — mapped to closest browser voice.

export function speak(text: string, voiceId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // Map voiceId prefix to gender hint for voice selection
    const voices = window.speechSynthesis.getVoices();
    const wantFemale = voiceId.startsWith("af_");
    const match =
      voices.find((v) =>
        wantFemale
          ? v.lang.startsWith("en") && /female|woman|girl/i.test(v.name)
          : v.lang.startsWith("en") && /male|man/i.test(v.name),
      ) ??
      voices.find((v) => v.lang.startsWith("en")) ??
      voices[0];
    if (match) utterance.voice = match;
    utterance.rate = 1.0;
    utterance.pitch = wantFemale ? 1.1 : 0.9;
    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(e);
    window.speechSynthesis.speak(utterance);
  });
}

export function listen(): Promise<string> {
  return new Promise((resolve, reject) => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return reject(new Error("STT not supported in this browser"));
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (e: any) => resolve(e.results[0][0].transcript as string);
    recognition.onerror = (e: any) => reject(new Error(e.error));
    recognition.start();
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/llm.ts lib/speech.ts
git commit -m "feat: add LLM and speech adapters (Gemini + Web Speech API)"
```

---

## Task 4: User model

**Files:**
- Create: `lib/userModel.ts`

- [ ] **Step 1: Create lib/userModel.ts**

```typescript
// lib/userModel.ts
import type { UserModel, SessionResult, DomainScores } from "./types";

const KEY = "clouddesk:userModel";

const DEFAULT_SCORES: DomainScores = {
  resilient: 50,
  performance: 50,
  secure: 50,
  cost: 50,
};

export function readUserModel(userId: string): UserModel {
  if (typeof window === "undefined") {
    return { userId, sessions: [], domainScores: { ...DEFAULT_SCORES }, seenCombinations: [] };
  }
  const raw = sessionStorage.getItem(KEY);
  if (!raw) {
    return { userId, sessions: [], domainScores: { ...DEFAULT_SCORES }, seenCombinations: [] };
  }
  return JSON.parse(raw) as UserModel;
}

export function updateUserModel(
  userId: string,
  result: { scenario: import("./types").ScenarioOutput; debrief: import("./types").DebriefOutput },
): void {
  if (typeof window === "undefined") return;
  const model = readUserModel(userId);
  const { scenario, debrief } = result;

  const session: SessionResult = {
    sessionId: `${userId}-${Date.now()}`,
    date: Date.now(),
    scenario,
    scores: debrief.scores,
    domainsExercised: debrief.examIntel.domainsExercised,
  };

  model.sessions.push(session);

  // Rolling weighted average: new = old * 0.7 + session * 0.3
  for (const domainId of debrief.examIntel.domainsExercised) {
    const key = domainId as keyof DomainScores;
    if (key in model.domainScores) {
      model.domainScores[key] =
        Math.round(model.domainScores[key] * 0.7 + debrief.scores.overall * 0.3);
    }
  }

  const combo = `${scenario.industry}:${scenario.problemStatement.slice(0, 40)}`;
  if (!model.seenCombinations.includes(combo)) {
    model.seenCombinations.push(combo);
  }

  sessionStorage.setItem(KEY, JSON.stringify(model));
}

export function pickWeakestDomain(model: UserModel): string {
  const scores = model.domainScores;
  return (Object.entries(scores) as [string, number][]).sort(
    (a, b) => a[1] - b[1],
  )[0][0];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/userModel.ts
git commit -m "feat: add user model with sessionStorage persistence and domain tracking"
```

---

## Task 5: Prompts

**Files:**
- Create: `prompts/scenarioAgent.ts`
- Create: `prompts/meetingAgent.ts`
- Create: `prompts/debriefAgent.ts`

- [ ] **Step 1: Create prompts/scenarioAgent.ts**

```typescript
// prompts/scenarioAgent.ts
import type { UserModel } from "@/lib/types";
import { SAA_DOMAINS } from "@/data/domains/aws-saa-c03";

export function buildScenarioPrompt(model: UserModel, weakDomain: string): string {
  const domain = SAA_DOMAINS.find((d) => d.id === weakDomain);
  const seen = model.seenCombinations.join("\n- ");

  return `You are a scenario generator for AWS Solutions Architect Associate (SAA-C03) exam prep.

Your job: generate ONE realistic client meeting scenario that exercises the "${domain?.name ?? weakDomain}" domain.

RULES:
- Return ONLY valid JSON matching the schema below — no markdown, no commentary
- The problemStatement describes a BUSINESS problem only — never mention AWS services or technical solutions
- The curveball is a mid-meeting complication (injected after exchange 5–8); keep it business-level
- The industry and problem must NOT match any previously seen combination
- targetDomains must include "${weakDomain}" and may include 1–2 others
- voiceId must be one of: af_sarah, af_bella, am_adam, am_michael

Previously seen combinations (do NOT repeat):
${seen ? `- ${seen}` : "(none yet — this is the first session)"}

Domain being targeted: ${domain?.name ?? weakDomain}
Key services for this domain: ${domain?.keyServices.join(", ")}
Key concepts: ${domain?.concepts.join(", ")}

Return this exact JSON shape:
{
  "clientName": "string",
  "clientTitle": "string",
  "companyName": "string",
  "industry": "string",
  "problemStatement": "string (2-3 sentences, business problem only)",
  "constraint": "string (one business constraint: budget/timeline/regulatory)",
  "targetDomains": ["string"],
  "curveball": "string (one sentence business complication)",
  "difficulty": "beginner|intermediate|expert",
  "tip": "string or null (beginner only — one actionable hint)",
  "voiceId": "af_sarah|af_bella|am_adam|am_michael"
}`;
}
```

- [ ] **Step 2: Create prompts/meetingAgent.ts**

```typescript
// prompts/meetingAgent.ts
import type { ScenarioOutput } from "@/lib/types";

export function buildMeetingPrompt(scenario: ScenarioOutput, exchangeCount: number): string {
  const injectCurveball = exchangeCount >= 5 && exchangeCount <= 8;

  return `You are ${scenario.clientName}, ${scenario.clientTitle} at ${scenario.companyName}.

BACKGROUND: ${scenario.problemStatement}
CONSTRAINT: ${scenario.constraint}
${injectCurveball ? `\nCURVEBALL TO INJECT THIS TURN (naturally, mid-conversation): ${scenario.curveball}\n` : ""}

RULES — follow these exactly:
1. Stay fully in character as ${scenario.clientName} — never break character, never say you are an AI
2. Ask EXACTLY ONE question per message — never stack questions
3. Base each follow-up on the user's previous answer
4. If the user's answer is vague or buzzword-heavy, push back: "Can you be more specific about...?"
5. Never correct the user's technical mistakes — defer everything to after the meeting
6. Wrap up naturally after 10–15 total exchanges, or when the user signals they're done
7. Expert mode: you may express skepticism about the solution if it seems incomplete

OPENING MESSAGE STYLE (first turn only):
Start mid-thought, human, no greeting formalities. Example: "Hey, thanks for jumping on — I'm ${scenario.clientName}. We've been going back and forth on this for weeks and honestly just need a fresh perspective..."

Keep messages concise: 2–4 sentences max.`;
}
```

- [ ] **Step 3: Create prompts/debriefAgent.ts**

```typescript
// prompts/debriefAgent.ts
import type { ScenarioOutput } from "@/lib/types";
import { SAA_DOMAINS } from "@/data/domains/aws-saa-c03";

export function buildDebriefPrompt(scenario: ScenarioOutput): string {
  const domainList = SAA_DOMAINS.map(
    (d) => `- ${d.id}: ${d.name} (exam weight ${Math.round(d.weight * 100)}%)`,
  ).join("\n");

  return `You are a strict AWS SAA-C03 exam coach grading a mock client meeting transcript.

SCENARIO CONTEXT:
- Client: ${scenario.clientName} (${scenario.clientTitle}) at ${scenario.companyName}
- Problem: ${scenario.problemStatement}
- Target domains: ${scenario.targetDomains.join(", ")}

SAA-C03 DOMAINS:
${domainList}

TASK: Grade the user's performance. Return ONLY valid JSON — no markdown, no commentary.

SCORING (0–100):
- technicalAccuracy: Were AWS service choices correct and well-reasoned?
- depthOfExplanation: Did the user explain WHY, not just WHAT?
- domainCoverage: Did the user address the scenario's target domains?
- communicationClarity: Was the explanation clear to a non-technical client?
- overall: Weighted average of the above

MOMENTS: Annotate key exchanges — good answers, incomplete answers, missed opportunities.

Return this exact JSON shape:
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
      "certRelevance": "which SAA-C03 concept this tests (optional)"
    }
  ],
  "examIntel": {
    "domainsExercised": ["resilient|performance|secure|cost"],
    "examQuestionExample": "A company needs... Which solution? (A)...(B)...(C)...(D)...",
    "keyConceptsTested": ["string"]
  },
  "studyNext": {
    "weakAreas": ["string"],
    "suggestedTopics": ["string"],
    "suggestedNextScenario": "one sentence describing ideal next scenario"
  }
}`;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prompts/
git commit -m "feat: add system prompts for all three agents"
```

---

## Task 6: Agents

**Files:**
- Create: `agents/scenarioAgent.ts`
- Create: `agents/meetingAgent.ts`
- Create: `agents/debriefAgent.ts`
- Create: `agents/orchestrator.ts`

- [ ] **Step 1: Create agents/scenarioAgent.ts**

```typescript
// agents/scenarioAgent.ts
import { callLLM } from "@/lib/llm";
import { readUserModel, pickWeakestDomain } from "@/lib/userModel";
import { buildScenarioPrompt } from "@/prompts/scenarioAgent";
import type { ScenarioOutput, SessionConfig } from "@/lib/types";

export async function scenarioAgent(
  userId: string,
  config: SessionConfig,
): Promise<ScenarioOutput> {
  const model = readUserModel(userId);
  const weakDomain = pickWeakestDomain(model);
  const systemPrompt = buildScenarioPrompt(model, weakDomain);

  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await callLLM(systemPrompt, [
      { role: "user", content: `Generate a ${config.difficulty} scenario targeting the ${weakDomain} domain.` },
    ], { json: true, temperature: 0.9 });

    let scenario: ScenarioOutput;
    try {
      scenario = JSON.parse(raw) as ScenarioOutput;
    } catch {
      continue;
    }

    if (
      scenario.targetDomains?.includes(weakDomain) &&
      scenario.problemStatement?.length > 20
    ) {
      return scenario;
    }
  }

  throw new Error("scenarioAgent: failed to generate valid scenario after 3 attempts");
}
```

- [ ] **Step 2: Create agents/meetingAgent.ts**

```typescript
// agents/meetingAgent.ts
import { callLLM } from "@/lib/llm";
import { buildMeetingPrompt } from "@/prompts/meetingAgent";
import type { ScenarioOutput, Message, SessionConfig } from "@/lib/types";

export async function meetingAgentReply(
  scenario: ScenarioOutput,
  config: SessionConfig,
  history: Message[],
): Promise<string> {
  // exchangeCount = number of assistant messages so far
  const exchangeCount = history.filter((m) => m.role === "assistant").length;
  const systemPrompt = buildMeetingPrompt(scenario, exchangeCount);

  const reply = await callLLM(systemPrompt, history, { temperature: 0.85 });
  return reply.trim();
}
```

- [ ] **Step 3: Create agents/debriefAgent.ts**

```typescript
// agents/debriefAgent.ts
import { callLLM } from "@/lib/llm";
import { updateUserModel } from "@/lib/userModel";
import { buildDebriefPrompt } from "@/prompts/debriefAgent";
import type { DebriefOutput, Message, ScenarioOutput } from "@/lib/types";

export async function debriefAgent(
  transcript: Message[],
  scenario: ScenarioOutput,
  userId: string,
): Promise<DebriefOutput> {
  const systemPrompt = buildDebriefPrompt(scenario);
  const transcriptText = transcript
    .map((m) => `${m.role === "user" ? "Candidate" : scenario.clientName}: ${m.content}`)
    .join("\n\n");

  const raw = await callLLM(
    systemPrompt,
    [{ role: "user", content: `Grade this transcript:\n\n${transcriptText}` }],
    { json: true, temperature: 0.2 },
  );

  const debrief = JSON.parse(raw) as DebriefOutput;

  // THE LOOP: update user model so next scenarioAgent call targets weak domain
  updateUserModel(userId, { scenario, debrief });

  return debrief;
}
```

- [ ] **Step 4: Create agents/orchestrator.ts**

```typescript
// agents/orchestrator.ts
import { scenarioAgent } from "./scenarioAgent";
import { debriefAgent } from "./debriefAgent";
import type { ScenarioOutput, Message, SessionConfig, DebriefOutput } from "@/lib/types";

export async function startSession(
  userId: string,
  config: SessionConfig,
): Promise<ScenarioOutput> {
  return scenarioAgent(userId, config);
}

export async function finishSession(
  userId: string,
  scenario: ScenarioOutput,
  transcript: Message[],
): Promise<DebriefOutput> {
  return debriefAgent(transcript, scenario, userId);
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add agents/
git commit -m "feat: add all three agents and orchestrator"
```

---

## Task 7: API Routes

**Files:**
- Create: `app/api/scenario/route.ts`
- Create: `app/api/meeting/route.ts`
- Create: `app/api/debrief/route.ts`

- [ ] **Step 1: Create app/api/scenario/route.ts**

```typescript
// app/api/scenario/route.ts
import { NextResponse } from "next/server";
import { startSession } from "@/agents/orchestrator";
import type { SessionConfig } from "@/lib/types";

export async function POST(req: Request) {
  const { userId, config } = (await req.json()) as {
    userId: string;
    config: SessionConfig;
  };

  try {
    const scenario = await startSession(userId, config);
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

- [ ] **Step 2: Create app/api/meeting/route.ts**

```typescript
// app/api/meeting/route.ts
import { NextResponse } from "next/server";
import { meetingAgentReply } from "@/agents/meetingAgent";
import type { ScenarioOutput, Message, SessionConfig } from "@/lib/types";

export async function POST(req: Request) {
  const { scenario, config, history } = (await req.json()) as {
    scenario: ScenarioOutput;
    config: SessionConfig;
    history: Message[];
  };

  try {
    const reply = await meetingAgentReply(scenario, config, history);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("meeting route error:", err);
    return NextResponse.json(
      { error: "Failed to get agent reply" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Create app/api/debrief/route.ts**

```typescript
// app/api/debrief/route.ts
import { NextResponse } from "next/server";
import { finishSession } from "@/agents/orchestrator";
import type { ScenarioOutput, Message } from "@/lib/types";

export async function POST(req: Request) {
  const { userId, scenario, transcript } = (await req.json()) as {
    userId: string;
    scenario: ScenarioOutput;
    transcript: Message[];
  };

  try {
    const debrief = await finishSession(userId, scenario, transcript);
    return NextResponse.json(debrief);
  } catch (err) {
    console.error("debrief route error:", err);
    return NextResponse.json(
      { error: "Failed to generate debrief" },
      { status: 500 },
    );
  }
}
```

Note: The debrief route calls `finishSession()` which calls `debriefAgent()` which calls `updateUserModel()`. However, `updateUserModel()` writes to `sessionStorage` — which doesn't exist server-side. We need to handle this: the API route returns the debrief JSON, and the **client** calls `updateUserModel()` after receiving it.

- [ ] **Step 4: Fix debriefAgent.ts — remove updateUserModel call, return debrief only**

The `updateUserModel` call must move to the client (debrief page). Update `agents/debriefAgent.ts`:

```typescript
// agents/debriefAgent.ts — remove the updateUserModel call
import { callLLM } from "@/lib/llm";
import { buildDebriefPrompt } from "@/prompts/debriefAgent";
import type { DebriefOutput, Message, ScenarioOutput } from "@/lib/types";

export async function debriefAgent(
  transcript: Message[],
  scenario: ScenarioOutput,
): Promise<DebriefOutput> {
  const systemPrompt = buildDebriefPrompt(scenario);
  const transcriptText = transcript
    .map((m) => `${m.role === "user" ? "Candidate" : scenario.clientName}: ${m.content}`)
    .join("\n\n");

  const raw = await callLLM(
    systemPrompt,
    [{ role: "user", content: `Grade this transcript:\n\n${transcriptText}` }],
    { json: true, temperature: 0.2 },
  );

  return JSON.parse(raw) as DebriefOutput;
}
```

Also update `agents/orchestrator.ts` — remove userId param from finishSession:

```typescript
// agents/orchestrator.ts
import { scenarioAgent } from "./scenarioAgent";
import { debriefAgent } from "./debriefAgent";
import type { ScenarioOutput, Message, SessionConfig, DebriefOutput } from "@/lib/types";

export async function startSession(
  userId: string,
  config: SessionConfig,
): Promise<ScenarioOutput> {
  return scenarioAgent(userId, config);
}

export async function finishSession(
  scenario: ScenarioOutput,
  transcript: Message[],
): Promise<DebriefOutput> {
  return debriefAgent(transcript, scenario);
}
```

And update `app/api/debrief/route.ts` to match:

```typescript
// app/api/debrief/route.ts (updated)
import { NextResponse } from "next/server";
import { finishSession } from "@/agents/orchestrator";
import type { ScenarioOutput, Message } from "@/lib/types";

export async function POST(req: Request) {
  const { scenario, transcript } = (await req.json()) as {
    scenario: ScenarioOutput;
    transcript: Message[];
  };

  try {
    const debrief = await finishSession(scenario, transcript);
    return NextResponse.json(debrief);
  } catch (err) {
    console.error("debrief route error:", err);
    return NextResponse.json(
      { error: "Failed to generate debrief" },
      { status: 500 },
    );
  }
}
```

The debrief page will call `updateUserModel(userId, { scenario, debrief })` client-side after receiving the response. This is correct — it completes THE LOOP on the client where sessionStorage is accessible.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/ agents/orchestrator.ts agents/debriefAgent.ts
git commit -m "feat: add API routes for scenario, meeting, and debrief"
```

---

## Task 8: Setup page (/)

**Files:**
- Modify: `app/page.tsx`
- Create: `app/globals.css` (already exists from scaffold — update colors)

- [ ] **Step 1: Write app/page.tsx**

```tsx
// app/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SessionConfig } from "@/lib/types";

const DIFFICULTIES = [
  { value: "beginner", label: "Beginner", desc: "Tips enabled, gentler client" },
  { value: "intermediate", label: "Intermediate", desc: "No tips, realistic pushback" },
  { value: "expert", label: "Expert", desc: "Skeptical client, complex constraints" },
] as const;

export default function SetupPage() {
  const router = useRouter();
  const [difficulty, setDifficulty] =
    useState<SessionConfig["difficulty"]>("intermediate");
  const [loading, setLoading] = useState(false);

  async function startSession() {
    setLoading(true);
    const userId = `user-${Date.now()}`;
    const config: SessionConfig = {
      userId,
      role: "solutions-architect",
      difficulty,
    };

    sessionStorage.setItem("clouddesk:config", JSON.stringify(config));
    sessionStorage.setItem("clouddesk:userId", userId);

    try {
      const res = await fetch("/api/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, config }),
      });
      const scenario = await res.json();
      sessionStorage.setItem("clouddesk:scenario", JSON.stringify(scenario));
      router.push("/brief");
    } catch {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-2xl text-white">CloudDesk</CardTitle>
          <CardDescription className="text-zinc-400">
            AWS Solutions Architect — simulated client meeting
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="text-sm text-zinc-400 mb-3">Difficulty</p>
            <div className="flex gap-2">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDifficulty(d.value)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                    difficulty === d.value
                      ? "border-blue-500 bg-blue-500/10 text-blue-400"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              {DIFFICULTIES.find((d) => d.value === difficulty)?.desc}
            </p>
          </div>
          <Button
            onClick={startSession}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? "Generating scenario..." : "Start Session"}
          </Button>
          <p className="text-xs text-zinc-600 text-center">
            You are a Senior Solutions Architect. A client meeting is waiting.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Test setup page manually**

```bash
npm run dev
```

Open http://localhost:3000. Verify: difficulty selector works, "Start Session" button calls `/api/scenario` (watch Network tab in devtools). You'll need a real `GEMINI_API_KEY` in `.env.local` for the scenario to generate. If you get a 500, check server logs.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add setup page with difficulty selector"
```

---

## Task 9: Brief page and components

**Files:**
- Create: `app/brief/page.tsx`
- Create: `components/Brief/BriefCard.tsx`
- Create: `components/Brief/JoinButton.tsx`

- [ ] **Step 1: Create components/Brief/BriefCard.tsx**

```tsx
// components/Brief/BriefCard.tsx
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SAA_DOMAINS } from "@/data/domains/aws-saa-c03";
import type { ScenarioOutput } from "@/lib/types";

const BADGE_COLORS: Record<string, string> = {
  resilient: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  performance: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  secure: "bg-red-500/20 text-red-300 border-red-500/30",
  cost: "bg-green-500/20 text-green-300 border-green-500/30",
};

interface Props {
  scenario: ScenarioOutput;
}

export function BriefCard({ scenario }: Props) {
  return (
    <Card className="bg-zinc-900 border-zinc-800 w-full max-w-xl">
      <CardContent className="pt-6 space-y-5">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Your client</p>
          <h2 className="text-2xl font-semibold text-white">{scenario.clientName}</h2>
          <p className="text-zinc-400">{scenario.clientTitle} · {scenario.companyName}</p>
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
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Domains tested</p>
          <div className="flex flex-wrap gap-2">
            {scenario.targetDomains.map((id) => {
              const domain = SAA_DOMAINS.find((d) => d.id === id);
              return (
                <span
                  key={id}
                  className={`text-xs border rounded-full px-3 py-1 ${BADGE_COLORS[id] ?? "bg-zinc-700 text-zinc-300 border-zinc-600"}`}
                >
                  {domain?.name ?? id}
                </span>
              );
            })}
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

- [ ] **Step 2: Create components/Brief/JoinButton.tsx**

```tsx
// components/Brief/JoinButton.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function JoinButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "connecting">("idle");

  function handleJoin() {
    setState("connecting");
    setTimeout(() => {
      router.push("/meeting");
    }, 500);
  }

  return (
    <Button
      onClick={handleJoin}
      disabled={state === "connecting"}
      size="lg"
      className="bg-blue-600 hover:bg-blue-700 text-white px-10"
    >
      {state === "connecting" ? "Connecting..." : "Join Meeting"}
    </Button>
  );
}
```

- [ ] **Step 3: Create app/brief/page.tsx**

```tsx
// app/brief/page.tsx
"use client";
import { useEffect, useState } from "react";
import { BriefCard } from "@/components/Brief/BriefCard";
import { JoinButton } from "@/components/Brief/JoinButton";
import type { ScenarioOutput } from "@/lib/types";

export default function BriefPage() {
  const [scenario, setScenario] = useState<ScenarioOutput | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("clouddesk:scenario");
    if (raw) setScenario(JSON.parse(raw));
  }, []);

  if (!scenario) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">Loading brief...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 gap-8">
      <div className="text-center">
        <p className="text-zinc-500 text-sm uppercase tracking-wider mb-2">Incoming meeting</p>
        <h1 className="text-3xl font-bold text-white">Review the brief</h1>
      </div>
      <BriefCard scenario={scenario} />
      <JoinButton />
    </main>
  );
}
```

- [ ] **Step 4: Test brief page**

```bash
npm run dev
```

Run a full session start: http://localhost:3000 → choose difficulty → Start Session. After scenario loads, you should land on `/brief` and see the brief card with client name, problem, domains, and Join Meeting button.

- [ ] **Step 5: Commit**

```bash
git add app/brief/ components/Brief/
git commit -m "feat: add brief page with scenario card and join button"
```

---

## Task 10: Meeting room

**Files:**
- Create: `app/meeting/page.tsx`
- Create: `components/MeetingRoom/ChatPanel.tsx`
- Create: `components/MeetingRoom/AvatarPanel.tsx`
- Create: `components/MeetingRoom/InputBar.tsx`
- Create: `components/MeetingRoom/MeetingHeader.tsx`

- [ ] **Step 1: Create components/MeetingRoom/ChatPanel.tsx**

```tsx
// components/MeetingRoom/ChatPanel.tsx
"use client";
import { useEffect, useRef } from "react";
import type { Message } from "@/lib/types";

interface Props {
  messages: Message[];
  clientName: string;
  isThinking: boolean;
}

export function ChatPanel({ messages, clientName, isThinking }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-blue-600 text-white rounded-br-sm"
                : "bg-zinc-800 text-zinc-200 rounded-bl-sm"
            }`}
          >
            {msg.role === "assistant" && (
              <p className="text-xs text-zinc-500 mb-1">{clientName}</p>
            )}
            {msg.content}
          </div>
        </div>
      ))}
      {isThinking && (
        <div className="flex justify-start">
          <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3">
            <p className="text-xs text-zinc-500 mb-1">{clientName}</p>
            <div className="flex gap-1 items-center h-4">
              <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" />
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 2: Create components/MeetingRoom/AvatarPanel.tsx**

```tsx
// components/MeetingRoom/AvatarPanel.tsx
interface Props {
  clientName: string;
  clientTitle: string;
  companyName: string;
  isSpeaking: boolean;
}

export function AvatarPanel({ clientName, clientTitle, companyName, isSpeaking }: Props) {
  const initials = clientName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className={`relative w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-semibold ${isSpeaking ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-zinc-900" : ""}`}>
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
    </div>
  );
}
```

- [ ] **Step 3: Create components/MeetingRoom/InputBar.tsx**

```tsx
// components/MeetingRoom/InputBar.tsx
"use client";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listen } from "@/lib/speech";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function InputBar({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

- [ ] **Step 4: Create components/MeetingRoom/MeetingHeader.tsx**

```tsx
// components/MeetingRoom/MeetingHeader.tsx
"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  clientName: string;
  companyName: string;
  onEnd: () => void;
  muted: boolean;
  onMuteToggle: () => void;
}

export function MeetingHeader({ clientName, companyName, onEnd, muted, onMuteToggle }: Props) {
  const [seconds, setSeconds] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");

  return (
    <header className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between bg-zinc-950">
      <div>
        <p className="text-white font-medium text-sm">{clientName} · {companyName}</p>
        <p className="text-zinc-500 text-xs">{mins}:{secs}</p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onMuteToggle}
          className="text-zinc-400 hover:text-white text-xs"
        >
          {muted ? "🔇 Unmute" : "🔊 Mute"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowConfirm(true)}
          className="text-red-400 hover:text-red-300 text-xs"
        >
          End Meeting
        </Button>
      </div>
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="bg-zinc-900 border-zinc-700">
          <DialogHeader>
            <DialogTitle className="text-white">End the meeting?</DialogTitle>
          </DialogHeader>
          <p className="text-zinc-400 text-sm">
            This will end the session and take you to the debrief.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowConfirm(false)} className="text-zinc-400">
              Cancel
            </Button>
            <Button
              onClick={() => { setShowConfirm(false); onEnd(); }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              End Meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
```

- [ ] **Step 5: Create app/meeting/page.tsx**

```tsx
// app/meeting/page.tsx
"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChatPanel } from "@/components/MeetingRoom/ChatPanel";
import { AvatarPanel } from "@/components/MeetingRoom/AvatarPanel";
import { InputBar } from "@/components/MeetingRoom/InputBar";
import { MeetingHeader } from "@/components/MeetingRoom/MeetingHeader";
import { speak } from "@/lib/speech";
import type { ScenarioOutput, Message, SessionConfig } from "@/lib/types";

export default function MeetingPage() {
  const router = useRouter();
  const [scenario, setScenario] = useState<ScenarioOutput | null>(null);
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    const rawScenario = sessionStorage.getItem("clouddesk:scenario");
    const rawConfig = sessionStorage.getItem("clouddesk:config");
    if (rawScenario) setScenario(JSON.parse(rawScenario));
    if (rawConfig) setConfig(JSON.parse(rawConfig));
  }, []);

  const sendToAgent = useCallback(
    async (history: Message[], currentScenario: ScenarioOutput, currentConfig: SessionConfig) => {
      setIsThinking(true);
      // Intentional 1-2s pacing delay
      await new Promise((r) => setTimeout(r, 1200));

      try {
        const res = await fetch("/api/meeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenario: currentScenario, config: currentConfig, history }),
        });
        const data = await res.json();
        const reply = data.reply as string;

        const newMsg: Message = { role: "assistant", content: reply };
        setMessages((prev) => [...prev, newMsg]);
        setIsThinking(false);

        if (!muted) {
          setIsSpeaking(true);
          await speak(reply, currentScenario.voiceId);
          setIsSpeaking(false);
        }
      } catch {
        setIsThinking(false);
      }
    },
    [muted],
  );

  // Fire opening greeting on mount
  useEffect(() => {
    if (!scenario || !config || initialized.current) return;
    initialized.current = true;
    sendToAgent([], scenario, config);
  }, [scenario, config, sendToAgent]);

  async function handleUserMessage(text: string) {
    if (!scenario || !config || isThinking) return;
    const userMsg: Message = { role: "user", content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    await sendToAgent(newHistory, scenario, config);
  }

  async function handleEndMeeting() {
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
          <InputBar
            onSend={handleUserMessage}
            disabled={isThinking}
          />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Test meeting room end-to-end**

```bash
npm run dev
```

Full flow: http://localhost:3000 → Start Session → Join Meeting. Verify:
- Opening greeting appears automatically after ~1.2s
- Text input is disabled while agent is generating
- Sending a message triggers another agent reply
- Voice plays (may need browser permission)
- End Meeting → confirm → navigates to /debrief (debrief page is blank for now)
- No console errors

- [ ] **Step 7: Commit**

```bash
git add app/meeting/ components/MeetingRoom/
git commit -m "feat: add meeting room with chat, avatar, voice, and end meeting"
```

---

## Task 11: Debrief page and components

**Files:**
- Create: `app/debrief/page.tsx`
- Create: `components/Debrief/ScoreCard.tsx`
- Create: `components/Debrief/MomentReplay.tsx`
- Create: `components/Debrief/ExamIntel.tsx`
- Create: `components/Debrief/StudyNext.tsx`

- [ ] **Step 1: Create components/Debrief/ScoreCard.tsx**

```tsx
// components/Debrief/ScoreCard.tsx
"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { DebriefOutput } from "@/lib/types";

function scoreColor(score: number) {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

function AnimatedScore({ target }: { target: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const step = target / 40;
    let current = 0;
    const id = setInterval(() => {
      current = Math.min(current + step, target);
      setDisplay(Math.round(current));
      if (current >= target) clearInterval(id);
    }, 25);
    return () => clearInterval(id);
  }, [target]);

  return <span className={scoreColor(target)}>{display}</span>;
}

const SCORE_LABELS: Record<string, string> = {
  technicalAccuracy: "Technical Accuracy",
  depthOfExplanation: "Depth of Explanation",
  domainCoverage: "Domain Coverage",
  communicationClarity: "Communication Clarity",
};

interface Props {
  scores: DebriefOutput["scores"];
}

export function ScoreCard({ scores }: Props) {
  return (
    <Card className="bg-zinc-900 border-zinc-800 w-full max-w-xl">
      <CardContent className="pt-6 space-y-4">
        <div className="text-center pb-2 border-b border-zinc-800">
          <p className="text-zinc-500 text-sm mb-1">Overall</p>
          <p className="text-6xl font-bold">
            <AnimatedScore target={scores.overall} />
          </p>
          <p className="text-zinc-500 text-sm">/100</p>
        </div>
        {Object.entries(SCORE_LABELS).map(([key, label]) => (
          <div key={key} className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">{label}</span>
            <span className="font-semibold text-base">
              <AnimatedScore target={scores[key as keyof typeof scores]} />
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create components/Debrief/MomentReplay.tsx**

```tsx
// components/Debrief/MomentReplay.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DebriefOutput } from "@/lib/types";

const TYPE_STYLES = {
  good: "border-l-green-500 bg-green-500/5",
  incomplete: "border-l-yellow-500 bg-yellow-500/5",
  missed: "border-l-red-500 bg-red-500/5",
};

const TYPE_LABELS = {
  good: "Strong answer",
  incomplete: "Incomplete",
  missed: "Missed opportunity",
};

interface Props {
  moments: DebriefOutput["moments"];
}

export function MomentReplay({ moments }: Props) {
  if (moments.length === 0) return null;

  return (
    <Card className="bg-zinc-900 border-zinc-800 w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-white text-base">Key Moments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {moments.map((m, i) => (
          <div
            key={i}
            className={`border-l-2 pl-4 py-2 rounded-r-md ${TYPE_STYLES[m.type]}`}
          >
            <p className="text-xs text-zinc-500 mb-1">
              Exchange {m.exchangeIndex + 1} · <span className="font-medium">{TYPE_LABELS[m.type]}</span>
            </p>
            <p className="text-zinc-300 text-sm italic mb-2">"{m.userMessage}"</p>
            <p className="text-zinc-400 text-sm">{m.annotation}</p>
            {m.certRelevance && (
              <p className="text-zinc-600 text-xs mt-1">SAA-C03: {m.certRelevance}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create components/Debrief/ExamIntel.tsx**

```tsx
// components/Debrief/ExamIntel.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SAA_DOMAINS } from "@/data/domains/aws-saa-c03";
import type { DebriefOutput } from "@/lib/types";

interface Props {
  examIntel: DebriefOutput["examIntel"];
}

export function ExamIntel({ examIntel }: Props) {
  return (
    <Card className="bg-zinc-900 border-zinc-800 w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-white text-base">Exam Intelligence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Domains exercised</p>
          <div className="flex flex-wrap gap-2">
            {examIntel.domainsExercised.map((id) => {
              const domain = SAA_DOMAINS.find((d) => d.id === id);
              return (
                <span key={id} className="text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-full px-3 py-1">
                  {domain?.name ?? id}
                </span>
              );
            })}
          </div>
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Example exam question</p>
          <p className="text-zinc-300 text-sm leading-relaxed bg-zinc-800/50 rounded-md p-3">
            {examIntel.examQuestionExample}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Key concepts tested</p>
          <ul className="space-y-1">
            {examIntel.keyConceptsTested.map((concept, i) => (
              <li key={i} className="text-zinc-400 text-sm flex items-start gap-2">
                <span className="text-zinc-600 mt-0.5">›</span>
                {concept}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create components/Debrief/StudyNext.tsx**

```tsx
// components/Debrief/StudyNext.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DebriefOutput } from "@/lib/types";

interface Props {
  studyNext: DebriefOutput["studyNext"];
  onStartNext: () => void;
}

export function StudyNext({ studyNext, onStartNext }: Props) {
  return (
    <Card className="bg-zinc-900 border-zinc-800 w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-white text-base">Study Next</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Weak areas</p>
          <ul className="space-y-1">
            {studyNext.weakAreas.map((area, i) => (
              <li key={i} className="text-red-400 text-sm flex items-start gap-2">
                <span className="mt-0.5">⚠</span> {area}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Suggested topics</p>
          <ul className="space-y-1">
            {studyNext.suggestedTopics.map((topic, i) => (
              <li key={i} className="text-zinc-400 text-sm flex items-start gap-2">
                <span className="text-zinc-600 mt-0.5">›</span> {topic}
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-zinc-800 pt-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Next scenario</p>
          <p className="text-zinc-300 text-sm italic mb-4">"{studyNext.suggestedNextScenario}"</p>
          <Button
            onClick={onStartNext}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            Start Next Session →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Create app/debrief/page.tsx**

```tsx
// app/debrief/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScoreCard } from "@/components/Debrief/ScoreCard";
import { MomentReplay } from "@/components/Debrief/MomentReplay";
import { ExamIntel } from "@/components/Debrief/ExamIntel";
import { StudyNext } from "@/components/Debrief/StudyNext";
import { updateUserModel } from "@/lib/userModel";
import type { DebriefOutput, ScenarioOutput, Message } from "@/lib/types";

export default function DebriefPage() {
  const router = useRouter();
  const [debrief, setDebrief] = useState<DebriefOutput | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const rawScenario = sessionStorage.getItem("clouddesk:scenario");
    const rawTranscript = sessionStorage.getItem("clouddesk:transcript");
    const userId = sessionStorage.getItem("clouddesk:userId") ?? "user";

    if (!rawScenario || !rawTranscript) {
      setLoading(false);
      return;
    }

    const scenario: ScenarioOutput = JSON.parse(rawScenario);
    const transcript: Message[] = JSON.parse(rawTranscript);

    fetch("/api/debrief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario, transcript }),
    })
      .then((r) => r.json())
      .then((data: DebriefOutput) => {
        // THE LOOP: update user model client-side (sessionStorage accessible here)
        updateUserModel(userId, { scenario, debrief: data });
        sessionStorage.setItem("clouddesk:debrief", JSON.stringify(data));
        setDebrief(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function startNextSession() {
    // Keep userModel, clear session state
    sessionStorage.removeItem("clouddesk:scenario");
    sessionStorage.removeItem("clouddesk:transcript");
    sessionStorage.removeItem("clouddesk:debrief");
    router.push("/");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-white font-medium">Grading your session...</p>
          <p className="text-zinc-500 text-sm">Analyzing transcript against SAA-C03 domains</p>
        </div>
      </main>
    );
  }

  if (!debrief) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">No debrief data found.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-12 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <p className="text-zinc-500 text-sm uppercase tracking-wider mb-2">Session complete</p>
          <h1 className="text-3xl font-bold text-white">Your Debrief</h1>
        </div>
        <ScoreCard scores={debrief.scores} />
        <MomentReplay moments={debrief.moments} />
        <ExamIntel examIntel={debrief.examIntel} />
        <StudyNext studyNext={debrief.studyNext} onStartNext={startNextSession} />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Test full session flow**

```bash
npm run dev
```

Complete a full session: setup → brief → meeting (at least 3 exchanges) → end meeting → verify:
- Debrief page shows "Grading..." loading state
- Scores animate in
- Moments, exam intel, study next all render
- "Start Next Session" returns to `/` and clears session data
- `sessionStorage.getItem("clouddesk:userModel")` in browser console shows updated domain scores

- [ ] **Step 7: Commit**

```bash
git add app/debrief/ components/Debrief/
git commit -m "feat: add debrief page with scores, moments, exam intel, and study next"
```

---

## Task 12: Dashboard page

**Files:**
- Create: `app/dashboard/page.tsx`
- Create: `components/Dashboard/DomainBars.tsx`
- Create: `components/Dashboard/SessionList.tsx`

- [ ] **Step 1: Create components/Dashboard/DomainBars.tsx**

```tsx
// components/Dashboard/DomainBars.tsx
"use client";
import { SAA_DOMAINS } from "@/data/domains/aws-saa-c03";
import type { DomainScores } from "@/lib/types";

const BAR_COLORS: Record<string, string> = {
  resilient: "bg-blue-500",
  performance: "bg-purple-500",
  secure: "bg-red-500",
  cost: "bg-green-500",
};

interface Props {
  domainScores: DomainScores;
}

export function DomainBars({ domainScores }: Props) {
  const entries = SAA_DOMAINS.map((d) => ({
    id: d.id,
    name: d.name,
    score: domainScores[d.id as keyof DomainScores] ?? 50,
  }));

  const weakest = entries.reduce((a, b) => (a.score < b.score ? a : b));

  return (
    <div className="space-y-4">
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-md px-4 py-3">
        <p className="text-blue-300 text-sm">
          <span className="font-medium">Next session targets:</span>{" "}
          {weakest.name} ({weakest.score}%) — your weakest domain
        </p>
      </div>
      {entries.map(({ id, name, score }) => (
        <div key={id}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-zinc-400">{name}</span>
            <span className="text-zinc-400 font-medium">{score}%</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${BAR_COLORS[id] ?? "bg-zinc-500"}`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create components/Dashboard/SessionList.tsx**

```tsx
// components/Dashboard/SessionList.tsx
import type { SessionResult } from "@/lib/types";

function scoreColor(score: number) {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

interface Props {
  sessions: SessionResult[];
}

export function SessionList({ sessions }: Props) {
  if (sessions.length === 0) {
    return <p className="text-zinc-600 text-sm">No sessions yet.</p>;
  }

  return (
    <div className="space-y-2">
      {[...sessions].reverse().map((s) => (
        <div
          key={s.sessionId}
          className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-md px-4 py-3"
        >
          <div>
            <p className="text-white text-sm font-medium">{s.scenario.clientName} · {s.scenario.companyName}</p>
            <p className="text-zinc-500 text-xs">
              {new Date(s.date).toLocaleDateString()} · {s.scenario.industry} · {s.difficulty}
            </p>
          </div>
          <p className={`text-xl font-bold ${scoreColor(s.scores.overall)}`}>
            {s.scores.overall}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create app/dashboard/page.tsx**

```tsx
// app/dashboard/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DomainBars } from "@/components/Dashboard/DomainBars";
import { SessionList } from "@/components/Dashboard/SessionList";
import { readUserModel } from "@/lib/userModel";
import type { UserModel } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [model, setModel] = useState<UserModel | null>(null);

  useEffect(() => {
    const userId = sessionStorage.getItem("clouddesk:userId") ?? "user";
    setModel(readUserModel(userId));
  }, []);

  if (!model) {
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
          <h1 className="text-2xl font-bold text-white">Your Progress</h1>
          <Button
            onClick={() => router.push("/")}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            New Session
          </Button>
        </div>

        <section>
          <h2 className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Domain Scores</h2>
          <DomainBars domainScores={model.domainScores} />
        </section>

        <section>
          <h2 className="text-zinc-400 text-xs uppercase tracking-wider mb-4">
            Sessions ({model.sessions.length})
          </h2>
          <SessionList sessions={model.sessions} />
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Add dashboard link to debrief page**

In `app/debrief/page.tsx`, add a link to the dashboard above the StudyNext card. Find the line that renders `<StudyNext ... />` and add before it:

```tsx
<div className="flex justify-center">
  <button
    onClick={() => router.push("/dashboard")}
    className="text-zinc-500 hover:text-zinc-300 text-sm underline underline-offset-2"
  >
    View your progress dashboard →
  </button>
</div>
```

Import `useRouter` is already present in the debrief page.

- [ ] **Step 5: Test the adaptive loop (THE CORE DEMO)**

```bash
npm run dev
```

1. Complete **Session 1**: go through setup → brief → meeting → debrief
2. Note which domain had the lowest score in the debrief
3. Click "Start Next Session →" (returns to /)
4. Start **Session 2**: note the domain badges on the brief card — they should target the weak domain from session 1
5. Visit `/dashboard` — verify domain bars and session list show both sessions

This is the key demo moment. If the scenario in session 2 targets the weak domain from session 1, the agentic feedback loop is working.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/ components/Dashboard/ app/debrief/page.tsx
git commit -m "feat: add dashboard with domain score bars and session history"
```

---

## Task 13: Deploy to Vercel

**Files:**
- Create: `vercel.json` (optional, only if needed for env var config)

- [ ] **Step 1: Set GEMINI_API_KEY in Vercel dashboard**

1. Push code to a GitHub repo: `git remote add origin <your-repo-url> && git push -u origin main`
2. Go to vercel.com → Import project → select the repo
3. Under Environment Variables, add: `GEMINI_API_KEY` = your Google AI Studio key
4. Deploy

- [ ] **Step 2: Test deployed app**

Open the Vercel URL. Complete a full 2-session flow:
- Session 1: any difficulty, 5+ exchanges, end meeting, see debrief
- Session 2: verify brief card domain badges differ from session 1 (targeting weak domain)
- Dashboard: verify both sessions appear

- [ ] **Step 3: Final commit with deployment URL**

```bash
git tag v1.0-phase-a
git push origin v1.0-phase-a
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Full session flow (setup → brief → meeting → debrief) — Tasks 8–11
- ✅ Scenario Agent targets weak domains — Task 6 + scenarioAgent reads weakest domain
- ✅ Meeting Agent: one Q, curveball injection, persona — Task 6 + prompt Task 5
- ✅ Debrief Agent: scores all 4 domains — Task 6 + prompt Task 5
- ✅ Feedback loop: debrief page calls `updateUserModel()`, next scenario reads it — Tasks 7, 11
- ✅ TTS on every agent message — Task 10 (speak() called after every reply)
- ✅ Provider isolation in lib/llm.ts + lib/speech.ts — Tasks 3, 4
- ✅ Dashboard with domain scores + adaptive callout — Task 12
- ✅ Vercel deployment — Task 13
- ✅ No hardcoded scenarios — all generated by Scenario Agent
- ✅ sessionStorage (not localStorage) — used throughout

**Type consistency:**
- `ScenarioOutput.voiceId` used in meeting page `speak()` call ✅
- `DebriefOutput.examIntel.domainsExercised` used in `updateUserModel()` ✅
- `SessionResult` shape matches `UserModel.sessions[]` ✅
- `SessionConfig.difficulty` used in scenario prompt ✅

**Placeholder scan:** None found.
