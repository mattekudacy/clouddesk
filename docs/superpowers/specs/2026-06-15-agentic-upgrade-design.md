# CloudDesk Agentic Upgrade — Design Spec

**Date:** 2026-06-15  
**Status:** Approved  
**Scope:** Real tool use + two-step debrief. Free-tier Gemini (≤10 RPM). No Azure, no deadline.  
**Framework:** Vercel AI SDK (`ai` package) — provider-agnostic, native Next.js integration, handles tool-call loop via `generateText({ tools, maxSteps })`.

---

## Goal

Make the three agents genuinely agentic:
- ScenarioAgent calls tools to read user history and validate its output — the model decides what to fetch
- DebriefAgent reasons per-exchange before synthesizing final scores
- Orchestrator runs the tool-call loop as infrastructure; agents stay clean

---

## Architecture

```
lib/tools.ts           ← Vercel AI SDK tool() definitions (execute functions + schemas)
lib/llm.ts             ← callLLM() and callLLMWithTools() — both wrap generateText()
agents/scenarioAgent.ts ← use callLLMWithTools instead of callLLM
agents/debriefAgent.ts  ← split into two sequential callLLM calls
agents/orchestrator.ts  ← no change needed; tool loop handled by AI SDK maxSteps
```

**Vercel AI SDK roles:**
- `generateText({ model, system, messages, tools, maxSteps })` — handles the tool-call loop automatically up to `maxSteps`. Replace the hand-rolled `callLLM` internals.
- `tool({ description, parameters, execute })` — defines each tool with a Zod schema. The SDK validates args and calls `execute`.
- Provider: `@ai-sdk/google` (`createGoogleGenerativeAI`) for Gemini. Swap to `@ai-sdk/azure` later by changing one import in `lib/llm.ts`.

**Dependencies to add:** `ai`, `@ai-sdk/google`, `zod`.

---

## Section 1: Tool Registry (`lib/tools.ts`)

Three pure JS tool functions with Gemini function-declaration schemas.

**Important:** Tools run server-side inside the API route. `sessionStorage` is unavailable there. The client sends its current `userModel` snapshot in the `/api/scenario` request body; the scenario API passes it to `scenarioAgent`, which passes it to `callLLMWithTools` as the execution context for tool calls. Tools receive the model directly — they do not call `readUserModel`.

### `readDomainScores()`
Returns `domainScores` from the passed-in user model snapshot.  
**Why:** ScenarioAgent reads actual scores to decide what to target, rather than having scores pre-stuffed into the system prompt.

### `listSeenCombinations()`
Returns the `seenCombinations` string array from the passed-in user model snapshot.  
**Why:** ScenarioAgent verifies its generated scenario doesn't repeat a seen industry:problem pair.

### `validateScenario(scenario: ScenarioOutput)`
Checks: (1) `targetDomains` includes the weakest domain, (2) `problemStatement` contains no AWS service names.  
Returns `{ valid: boolean, reason: string }`.  
**Why:** Replaces the dumb 3-attempt retry loop with model-driven self-correction. If invalid, the model gets the reason and fixes it in the next tool-call round.

### Schema shape (each tool)
Each tool defined with Vercel AI SDK's `tool()` helper and Zod parameter schemas. `lib/tools.ts` exports a `scenarioTools` object — passed directly to `generateText({ tools: scenarioTools })`.

```typescript
import { tool } from "ai";
import { z } from "zod";

export const scenarioTools = {
  readDomainScores: tool({
    description: "...",
    parameters: z.object({}),
    execute: async (_, { context }) => { ... },
  }),
  // ...
};
```

`toolContext` (the user model snapshot) is passed via `generateText`'s `experimental_context` or closure — tools capture it at definition time when `scenarioTools` is built inside `callLLMWithTools`.

---

## Section 2: LLM Adapter (`lib/llm.ts`)

Replace the current `@google/genai` implementation with Vercel AI SDK. Both exported functions wrap `generateText`.

```typescript
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY! });
const MODEL = google("gemini-2.5-flash");
```

**`callLLM(systemPrompt, messages, opts)`** — unchanged external signature. Internally calls `generateText({ model: MODEL, system, messages, temperature })` and returns `text`.

**`callLLMWithTools(systemPrompt, messages, userModel, opts)`** — builds `scenarioTools` as a closure over `userModel` (so tools can access the snapshot without global state), then calls `generateText({ model: MODEL, system, messages, tools: scenarioTools, maxSteps: 4 })`. Returns `text`.

`maxSteps: 4` = 1 initial + up to 3 tool-call rounds. The AI SDK handles the loop; no manual round-tripping needed.

**Call budget:** ScenarioAgent worst case = 4 steps. Full session ~15 calls. Within free tier for a single session; back-to-back sessions may hit 10 RPM cap.

---

## Section 3: ScenarioAgent (`agents/scenarioAgent.ts`)

Replace `callLLM` with `callLLMWithTools`. Remove the 3-attempt retry loop — self-correction via `validateScenario` tool replaces it.

**Behavioral change:** The model now reads domain scores and seen combinations because it chose to call the tools, not because the prompt pre-stuffed the data. This is the observable agentic property.

**System prompt change:** Remove pre-injected history/scores. Add tool descriptions. The prompt tells the model: "Use readDomainScores and listSeenCombinations to understand the user before generating. Use validateScenario before returning."

---

## Section 4: DebriefAgent (`agents/debriefAgent.ts`)

Split into two sequential `callLLM` calls. External signature unchanged.

### Step 1 — Exchange analysis
- Input: transcript + scenario context
- Temperature: 0.1
- Output: `ExchangeAnalysis[]` — per-exchange `{ score: number, type: good|incomplete|missed, annotation: string }`
- Prompt instructs: score each exchange independently, do not synthesize yet

### Step 2 — Synthesis
- Input: transcript + scenario context + Step 1 exchange analysis
- Temperature: 0.2
- Output: full `DebriefOutput` (existing shape, unchanged)
- Prompt instructs: derive scores from the exchange analysis evidence, not from re-reading the transcript

**Quality gain:** `overall` score is evidence-derived. `moments` array is richer. `studyNext.weakAreas` cites specific exchanges.

### New internal type
```typescript
type ExchangeAnalysis = {
  exchangeIndex: number;
  score: number;
  type: "good" | "incomplete" | "missed";
  annotation: string;
};
```
This type is internal to `debriefAgent.ts` — not exported, not added to `lib/types.ts`.

---

## Section 5: What Does NOT Change

- `agents/meetingAgent.ts` — stays single-call, no tools
- `agents/orchestrator.ts` — no changes needed
- `lib/speech.ts` — untouched
- `lib/types.ts` — no new exported types
- `lib/userModel.ts` — no changes (tools read from it, don't write)
- All component files — no changes
- All API route files — no changes

---

## Call Budget Summary

| Agent | Current calls | After upgrade |
|---|---|---|
| ScenarioAgent | 1 (+ up to 2 retries) | 1–4 (tool loop, max 3 rounds) |
| MeetingAgent | 1 per exchange | 1 per exchange (unchanged) |
| DebriefAgent | 1 | 2 (exchange analysis + synthesis) |
| **Full 10-exchange session** | **~12** | **~15 typical** |

A 10-exchange session at 15 calls takes ~90 seconds minimum at 10 RPM — the natural meeting pacing (user typing between exchanges) keeps this well within limits.

---

## Files to Create or Modify

| File | Action |
|---|---|
| `package.json` | Add `ai`, `@ai-sdk/google`, `zod` |
| `lib/tools.ts` | Create — Vercel AI SDK `tool()` definitions |
| `lib/llm.ts` | Rewrite internals to use `generateText`; add `callLLMWithTools` |
| `agents/scenarioAgent.ts` | Modify — use tools, remove retry loop |
| `agents/debriefAgent.ts` | Modify — two-step pipeline |
| `prompts/scenarioAgent.ts` | Modify — remove pre-injected data, add tool guidance |
| `prompts/debriefAgent.ts` | Modify — add exchange analysis prompt (Step 1) |
| `app/api/scenario/route.ts` | Modify — accept `userModel` in request body, pass to agent |
| `app/page.tsx` | Modify — send `userModel` snapshot in scenario fetch body |
