# CloudDesk Multi-Role Design Spec

**Date:** 2026-06-15
**Status:** Approved
**Scope:** Add Senior Developer and Team Lead roles with free counterpart selection. Solutions Architect counterpart also becomes user-selectable. No debrief changes.

---

## Goal

Let users practice in three distinct professional roles, each with a defined knowledge depth, against any of four counterpart personas. The scenario and meeting agents use both role and counterpart to calibrate question type, expected answer specificity, and meeting tone.

---

## Role Definitions

These definitions are injected into the scenario prompt so the agent calibrates correctly.

**Solutions Architect**
Designs end-to-end cloud systems. Expected to reason about scalability, reliability, security patterns, and cost trade-offs at a high level. Scenarios involve architectural decisions, not implementation detail. "Why this service over that one, and what are the failure modes?"

**Senior Developer**
Deep implementation knowledge. Expected to know specific APIs, SDKs, deployment patterns, CI/CD, and debugging approaches. Scenarios are hands-on: "how would you actually build this, what would break, how would you test it?"

**Team Lead**
Bridges technical and organizational concerns. Expected to justify architectural decisions to both engineers and stakeholders, manage technical debt trade-offs, and explain the "why" behind design choices. Scenarios involve defending decisions and communicating constraints.

---

## Counterpart Definitions

**Client** (`"client"`)
A business stakeholder with partial technical understanding. Asks outcome-focused questions. Pushes on timelines, costs, risk. Does not need service-level detail but expects clear reasoning.

**Non-Technical** (`"non-tech"`)
A curious, intelligent layperson. No cloud or technical background. Asks "but what does that actually mean?" and "can you explain that without the jargon?" Challenges the user to communicate simply and clearly.

**Junior Developer** (`"junior-dev"`)
A curious, slightly uncertain junior dev. Asks "why" questions, admits confusion, defers to the user's expertise. Wants to understand reasoning, not just what to do. May ask follow-up clarifying questions.

**Team Engineer** (`"team-engineer"`)
A capable engineer who understands the tech and pushes back. "I get that, but couldn't we just do X instead?" Challenges design decisions technically. Will not accept vague answers.

---

## Counterpart Selection

All three roles get a free counterpart picker — user always chooses explicitly. No auto-derivation from difficulty.

| Role | Available counterparts |
|---|---|
| Solutions Architect | client, non-tech, junior-dev, team-engineer |
| Senior Developer | client, non-tech, junior-dev, team-engineer |
| Team Lead | client, non-tech, junior-dev, team-engineer |

---

## Type Changes (`lib/types.ts`)

```typescript
// SessionConfig — add team-lead and counterpartRole
type SessionConfig = {
  userId: string;
  role: "solutions-architect" | "senior-developer" | "team-lead";
  counterpartRole: "client" | "non-tech" | "junior-dev" | "team-engineer";
  difficulty: "beginner" | "intermediate" | "expert";
};

// ScenarioOutput — add counterpartRole
type ScenarioOutput = {
  // ... all existing fields unchanged ...
  counterpartRole: "client" | "non-tech" | "junior-dev" | "team-engineer";
};
```

`counterpartRole` is set by the scenario agent (it echoes back `config.counterpartRole`) so downstream code never re-derives it from config.

---

## Prompt Changes

### `prompts/scenarioAgent.ts`

`buildScenarioPrompt(role, counterpartRole)` receives both values.

The system prompt injects:
1. The role definition (what depth/type of knowledge is expected from the user)
2. The counterpart definition (who they're talking to, what that person cares about)
3. Updated JSON schema instruction including `counterpartRole` field

The `clientName`, `clientTitle`, `companyName` fields remain in `ScenarioOutput` — the scenario agent generates contextually appropriate names for each counterpart type:
- `client` → business stakeholder name/title at a company
- `non-tech` → curious individual with a non-technical title ("Writer", "Product Manager", "Teacher")
- `junior-dev` → junior developer name/title at a company
- `team-engineer` → senior/staff engineer name/title at a company

### `prompts/meetingAgent.ts`

`buildMeetingPrompt(scenario, exchangeCount)` — signature unchanged, reads `scenario.counterpartRole`.

Adds a persona block injected before the rules:

- `"client"` → current behavior unchanged
- `"non-tech"` → "You have no technical background. When the user uses jargon, ask what it means in plain terms. Challenge them to explain without buzzwords. Be curious and engaged but genuinely confused by technical terms."
- `"junior-dev"` → "You are a junior developer eager to learn. Ask 'why' questions. Admit when you don't understand something. Defer to the user's expertise but keep asking for clarification until it makes sense."
- `"team-engineer"` → "You are a capable senior engineer. Challenge design decisions technically. Suggest alternatives. Push back if something sounds over-engineered or if there's a simpler path. Don't accept vague answers."

Opening message style also switches per counterpart:
- `"client"` → current style (mid-thought business context)
- `"non-tech"` → "Hey, I hope this isn't too basic a question, but I've been trying to understand how all this cloud stuff works..."
- `"junior-dev"` → "Hey, got a sec? I'm working on [X] and I'm a bit stuck on [Y], do you mind walking me through it?"
- `"team-engineer"` → "Before we commit to this design, I want to push back a bit on [X] — have we considered just doing [Y] instead?"

---

## Agent Changes

### `agents/scenarioAgent.ts`

Pass `config.role` and `config.counterpartRole` to prompt:

```typescript
const systemPrompt = buildScenarioPrompt(config.role, config.counterpartRole);
```

No other changes.

---

## UI Changes

### `app/page.tsx`

Two new selectors added above the difficulty selector:

**Role picker** (3 buttons):
- Solutions Architect — "End-to-end cloud system design"
- Senior Developer — "Implementation depth, APIs, and debugging"
- Team Lead — "Architectural decisions and technical communication"

Default: `"solutions-architect"`

**Counterpart picker** (4 buttons):
- Client — "Business stakeholder, outcome-focused"
- Non-Technical — "Curious layperson, explain without jargon"
- Junior Dev — "Junior developer, teach and mentor"
- Team Engineer — "Senior engineer, defend your decisions"

Default: `"client"`

`SessionConfig` sent to API includes both `role` and `counterpartRole`.

### `components/Brief/BriefCard.tsx`

The "Your client" label becomes counterpart-aware:

| `counterpartRole` | Label |
|---|---|
| `"client"` | "Your client" |
| `"non-tech"` | "You're explaining to" |
| `"junior-dev"` | "You're being asked by" |
| `"team-engineer"` | "Your audience" |

---

## Files Changed

| File | Change |
|---|---|
| `lib/types.ts` | Add `"team-lead"` to role union; add `counterpartRole` to `SessionConfig` and `ScenarioOutput` |
| `app/page.tsx` | Role picker + counterpart picker |
| `prompts/scenarioAgent.ts` | `buildScenarioPrompt(role, counterpartRole)` with role/counterpart definitions |
| `prompts/meetingAgent.ts` | Counterpart-aware persona block + opening style |
| `agents/scenarioAgent.ts` | Pass `config.role`, `config.counterpartRole` to prompt builder |
| `components/Brief/BriefCard.tsx` | Counterpart-aware label |

## Files Unchanged

`lib/llm.ts`, `lib/tools.ts`, `lib/userModel.ts`, `agents/debriefAgent.ts`, `agents/orchestrator.ts`, `prompts/debriefAgent.ts`, `app/api/scenario/route.ts`, `app/api/meeting/route.ts`, `app/api/debrief/route.ts`, all dashboard/debrief components.
