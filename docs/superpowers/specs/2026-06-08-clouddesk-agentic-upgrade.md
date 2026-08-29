# CloudDesk Agentic Upgrade — Design Spec

**Date:** 2026-06-08  
**Track:** Microsoft Agents League 2026 — Reasoning Agents  
**Deadline:** June 14, 2026

---

## Problem with Current Architecture

The current CloudDesk has three stateless LLM calls connected by a hardcoded pipeline. Within a session, nothing reasons — the Meeting Agent is a text transformer with no goals, the Debrief Agent is a single-shot grader. This is an "AI-powered app," not a reasoning agent.

**What makes something a reasoning agent:** it has a goal it pursues, makes decisions to advance toward that goal, and can use tools to gather information mid-task.

---

## Upgrade: Two Agentic Additions

### 1. Session Planner Agent

A new agent that runs after scenario generation, before the meeting begins. It reads the scenario + user model and produces a **ProbePlan**: 4–6 specific concepts the Meeting Agent must systematically cover during the conversation.

The Meeting Agent is upgraded to receive the ProbePlan. Each turn it:
1. Identifies which probes remain uncovered
2. Selects the next probe to target
3. Formulates a question that naturally probes that concept
4. Updates the plan (marks covered when the user addresses the concept)

**Visible to judges:** A probe checklist in the meeting room's AvatarPanel sidebar ticks off in real time as the agent covers each concept. This is the most visible demonstration of planning + execution.

### 2. Tool-using Debrief Agent

The Debrief Agent is upgraded from a single-shot prompt to a multi-step reasoning loop using Gemini function calling. It calls three tools:

- `getProbeExpectations(probeId)` — returns what a strong/weak answer looks like for each probe
- `getSAADomainConcepts(domainId)` — returns official SAA-C03 concepts and key services for a domain
- `selfCritiqueGrade(draftScores)` — the model critiques its own draft scores before finalizing

**Reasoning chain:**
1. Grade each probe turn-by-turn using `getProbeExpectations()`
2. Cross-reference against `getSAADomainConcepts()` to catch missed concepts
3. Draft scores
4. Call `selfCritiqueGrade()` — revise if critique identifies inflation/deflation
5. Return final DebriefOutput

Tools are pure local functions (no external APIs) — structured lookups into existing data. The agentic behavior is that the **LLM decides which tools to call** using Gemini's native function calling API.

---

## New Data Type: ProbePlan

```typescript
type Probe = {
  id: string;
  concept: string;       // e.g. "Multi-AZ vs Multi-Region failover"
  intent: string;        // what a correct answer demonstrates
  covered: boolean;
  quality?: "strong" | "weak" | "missed";
};

type ProbePlan = {
  probes: Probe[];
  targetDomain: string;
  sessionGoal: string;  // one sentence goal for the full session
};
```

Stored in `sessionStorage` as `clouddesk:probePlan`. The meeting page sends the current plan with each turn and receives the updated plan back.

---

## Architecture Changes

### New files

| File | Purpose |
|---|---|
| `agents/plannerAgent.ts` | `plannerAgent(scenario, userModel): Promise<ProbePlan>` |
| `prompts/plannerAgent.ts` | `buildPlannerPrompt(scenario, model): string` |
| `app/api/plan/route.ts` | POST → plannerAgent |
| `lib/tools.ts` | Tool definitions + implementations for Debrief Agent |

### Modified files

| File | Change |
|---|---|
| `lib/types.ts` | Add `Probe`, `ProbePlan` types |
| `lib/llm.ts` | Add `tools` option to `callLLM` for function calling; add `callLLMWithTools` for multi-step tool loop |
| `agents/meetingAgent.ts` | Accept + return updated `ProbePlan`; system prompt includes current probe state |
| `prompts/meetingAgent.ts` | Update to include probe tracking instructions |
| `agents/debriefAgent.ts` | Replace single LLM call with tool-calling loop |
| `prompts/debriefAgent.ts` | Update for tool-using grading workflow |
| `app/api/meeting/route.ts` | Accept `probePlan` in body; return `{ reply, probePlan }` |
| `app/api/plan/route.ts` | New |
| `app/meeting/page.tsx` | Fetch probePlan on mount; send/receive updated plan each turn |
| `components/MeetingRoom/AvatarPanel.tsx` | Add probe checklist panel |

### Session flow (updated)

```
/ (setup) 
  → POST /api/scenario → ScenarioAgent → scenario stored in sessionStorage
  → POST /api/plan    → PlannerAgent  → probePlan stored in sessionStorage
  → /brief            (shows scenario; probePlan hidden from user)
  → /meeting          (AvatarPanel shows probe checklist updating in real time)
      each user turn: POST /api/meeting with { scenario, history, probePlan }
                      returns { reply, probePlan }  ← plan updated each turn
  → POST /api/debrief → DebriefAgent (tool-calling loop) → DebriefOutput with per-probe grades
  → /debrief          (shows per-probe grades alongside overall scores)
  → /dashboard
```

---

## Tool Definitions (lib/tools.ts)

Three tools the Debrief Agent can call:

```typescript
getProbeExpectations(probeId: string): ProbeExpectation
// Returns: { strongAnswer: string, weakAnswer: string, missedSignals: string[] }
// Source: built from the ProbePlan stored in sessionStorage (passed via API)

getSAADomainConcepts(domainId: string): DomainConcepts  
// Returns: { name, keyServices, concepts } from aws-saa-c03.ts
// Source: SAA_DOMAINS lookup — pure local data

selfCritiqueGrade(draftScores: DebriefOutput["scores"]): CritiqueResult
// Returns: { feedback: string, suggestedAdjustments: Partial<DebriefOutput["scores"]> }
// Source: Another LLM call at temperature 0.1 — the model reviewing its own work
```

These tools are registered as Gemini function declarations. The LLM calls them by name during its reasoning loop.

---

## Azure Swap

Gemini function calling → Azure OpenAI function calling. Same tool schema (JSON Schema format), different SDK call. All changes in `lib/llm.ts`. Agent code untouched.

---

## Definition of Done

- [ ] PlannerAgent generates a ProbePlan targeting the weak domain
- [ ] Meeting room sidebar shows probe checklist updating in real time
- [ ] Meeting Agent selects questions based on uncovered probes
- [ ] Debrief Agent makes at least 2 tool calls (visible in server logs)
- [ ] Debrief output includes per-probe grades
- [ ] Full 2-session flow still works end to end
- [ ] No regressions in existing functionality
