# CloudDesk — Claude Project Instructions

**Purpose:** Personal project — cloud certification prep study tool, agentic sandbox, and portfolio piece.

> **This doc holds invariants, not inventory.** Types live in `lib/types.ts`, structure lives in the filesystem, and both are authoritative over anything written here. Never restate a type definition or a file tree in this doc — a stale copy is worse than no copy, because it gets followed confidently. Write down the rules and the reasons; read the code for the shapes.

---

## What This Project Is

A multi-agent cloud certification prep app. The user practices as a senior role (Solutions Architect, Senior Developer, Team Lead) in a simulated meeting. Three agents run the session lifecycle:

1. **Scenario Agent** — tool-calling; reads domain scores for the active cert, avoids seen scenarios, generates the highest-value next scenario targeting weak domains
2. **Meeting Agent** — plays the counterpart persona, calibrated to user role and counterpart type
3. **Debrief Agent** — per-exchange scoring → synthesis → returns a domain score delta

**The feedback loop is the product.** Debrief produces a delta → the client applies it to the user model → the next Scenario Agent run reads it and targets differently. If a change makes the loop harder to demonstrate across two consecutive sessions, it is the wrong change.

**Cert scope:** multi-cert by design, single-cert by delivery. Types, storage, and UI are cert-scoped from the start. Ship one cert's domain data and prove the loop before authoring more.

---

## Hard Invariants

Violating any of these is a bug even if it compiles.

1. **Provider code lives only in `lib/`.** Never import an LLM or speech SDK inside `agents/`. Everything goes through `lib/llm.ts` and `lib/speech.ts`.
2. **Agents never touch storage.** No agent reads or writes browser storage. Agents take inputs, call the LLM adapter, return values. This is what lets them run inside API routes.
3. **`orchestrator.ts` is client-side only.** It is the single seam where pure agents meet browser storage, and the only caller of `updateUserModel`.
4. **`lib/userModel.ts` is the only file that touches storage.** Everything else goes through its exports.
5. **Nothing crosses the LLM boundary unvalidated.** See below.
6. **The model never echoes config back.** `ScenarioOutput` contains generated content only. Anything already known from `SessionConfig` — `difficulty`, `counterpartRole`, `cert` — is read from config, never from model output.
7. **Every domain score belongs to a `cert`.** There is no cert-agnostic notion of a domain score, and scores from different certs are never averaged or compared.
8. **Users never see domain IDs.** Resolve through the cert registry to human-readable names at the render site.

---

## The LLM Boundary

Every agent output is untrusted input. `JSON.parse(...) as T` is a lie the compiler believes and the runtime doesn't — a missing field surfaces as an undefined crash two pages downstream, far from its cause.

**Rule:** define a Zod schema for every LLM-produced type and parse inside `lib/llm.ts` before returning. The adapter returns validated data or throws; agents never see raw text. Zod is already present transitively via the AI SDK's `inputSchema`, so this costs nothing new.

This is also what makes `validateScenario` meaningful — semantic validation on an object whose shape was never checked is checking the wrong layer first.

On a parse failure: retry once with the validation error appended to the prompt, then fail loudly. Never coerce, never fill defaults, never return partial output.

---

## The Feedback Loop

The one flow worth being precise about, because it is both the product and the thing most easily broken silently.

```
scenarioAgent  ──reads──>  domainScores[cert]  (via tools, from the request body)
                                    ▲
                                    │ updateUserModel()   ← orchestrator, client-side
                                    │
debriefAgent   ──returns──>  domainScoreDelta            ← agent, server-side, pure
```

- `debriefAgent` returns a delta describing this session's per-domain performance — a real per-domain average, not the overall score broadcast to every exercised domain. It does not persist anything.
- The per-domain attribution comes from each exchange's own `domainId` (enum-constrained to `scenario.targetDomains` at the schema level — see `makeExchangeAnalysisEntrySchema`, `lib/schemas.ts`), not from the model's freeform claim about which domains it exercised. `buildDomainScoreDelta` (`agents/debriefAgent.ts`) averages exchange scores grouped by `domainId`, then filters against the cert's real domain list before returning. That filter is load-bearing, not defense-in-depth: `/api/debrief` takes `scenario` straight from an unauthenticated client, so `lib/requestSchemas.ts` also validates `targetDomains` against the cert's domain list at the API boundary — two independent layers, matching the Scenario Agent side's own server-side recomputation in `validateScenario`.
- `debrief.examIntel.domainsExercised`, once computed, gets written back onto the debrief object before it crosses `/api/debrief`'s response — so `lib/userModel.ts`'s storage and the debrief UI both see the corrected value with no code of their own needed to enforce it. Hallucinated keys must never reach storage.
- `orchestrator.finishSession` applies the delta after the response lands.
- If the debrief succeeds but the model update throws, **show the debrief anyway.** The user's grade is not contingent on bookkeeping.
- Scores merge as an exponential moving average, α = 0.4, first observation taken raw. Recent sessions dominate — improvement should be visible within two or three sessions, not diluted by early bad scores.

**Acceptance test, not a unit test:** run two sessions back to back. Session 2 must target a different domain than session 1, driven by the worst score from session 1. Everything here can typecheck while the loop is open.

---

## Agent Contracts

**Scenario Agent.** Uses `callLLMWithTools`. Loop: read scores → check seen combinations → generate → validate → fix and retry if invalid. Weakest-domain selection is weight-adjusted, since a mediocre score in a heavily weighted domain matters more than a poor one in a minor domain. Unattempted domains rank as weakest — `validateScenario` recomputes this itself from `domainScores`/`weight`/attempted status and rejects a scenario that targets the wrong domain; the model's own claim about which domain is weakest is never trusted.

Receives a **projection** of the user model (`ScenarioContext`, `lib/types.ts`), not the whole thing — domain scores, seen combinations, and which domain IDs have been attempted, nothing else. Session history (full past scenarios, per-session scores, dates) grows unboundedly and the agent has no use for it; `toScenarioContext` (`lib/userModel.ts`) does the narrowing client-side, before anything crosses the network. The projection is also the clearest statement of what the agent is allowed to see.

**Meeting Agent.** Uses `callLLM`. Receives the scenario (which already carries `counterpartRole`, `difficulty`, and `cert` from config — see Hard Invariant #6) and the full turn history; returns plain text. One question per message. Never corrects the user mid-meeting — that is the debrief's job. Curveball lands at exchange 5–8. Wraps at 10–15.

**Debrief Agent.** Two steps: score each exchange (temperature 0.1), then synthesize (temperature 0.2).

Per-exchange scoring runs in **parallel**. Each exchange scores independently by design, so `Promise.all` is correct, and the sequential version is the longest operation in the app running against a serverless function timeout on a 15-exchange transcript. This is a latency fix and a timeout fix at once.

Held to the same standard as the Scenario Agent's `validateScenario`: each exchange's `domainId` is schema-constrained to `scenario.targetDomains`, not free text, and the domain-level delta is computed deterministically in code (`buildDomainScoreDelta`) from those validated per-exchange values — never trusted from the model's own synthesized `examIntel.domainsExercised`, which is why that field isn't even requested in the synthesis prompt anymore. The Scenario Agent has independent server-side recomputation and reject-and-retry on the way in; this is the equivalent guard on the way out.

---

## Certs, Roles, Counterparts

Every session targets exactly one cert, picked first on the setup screen. Adding a cert means one data file plus one registry entry in `data/domains/index.ts` — no changes to agents, prompts, or storage. If a cert requires touching an agent, the abstraction is wrong.

Certs with no domain data yet are visibly disabled, not hidden.

Counterpart persona is derived from difficulty, never picked directly, and lives in `SessionConfig` only:

| Difficulty     | Counterpart     | Persona                                                        |
| -------------- | --------------- | -------------------------------------------------------------- |
| `beginner`     | `non-tech`      | Curious layperson, no cloud background, wants plain English    |
| `intermediate` | `client`        | Business stakeholder, outcome-focused, pushes on cost and risk |
| `expert`       | `team-engineer` | Senior engineer who challenges design decisions technically    |

**Resolved:** reconciled at the prompt level, not the type level. `buildScenarioPrompt` includes a role↔cert framing instruction that reinterprets any of the 3 roles against whatever domain list the active cert supplies — e.g. a Solutions Architect studying AZ-104 (an administrator exam) gets architectural-decision framing applied to subscription/RBAC/network design, not generic multi-region system design. No `CertDefinition` role field; no setup-screen filtering.

---

## Failure Behavior

Specified because an LLM app's failure modes are its normal operating conditions, not edge cases.

- **Scenario generation fails** — block on the brief screen with a retry. There is no session without a scenario, and a fallback scenario would silently break the loop by targeting nothing.
- **Meeting turn fails** — preserve the user's typed message in the input, surface an inline retry. Losing what someone typed mid-conversation is the worst failure in the app.
- **Debrief fails** — offer retry against the same transcript, which is still in memory. Never write a partial delta.
- **Storage unavailable or corrupt** — read fails to a clean empty model rather than throwing. The app must run in private browsing with no persistence.
- **Speech synthesis unavailable or not configured** (server-side rendering, or this deployment has no `ELEVENLABS_API_KEY`/voice mapping) — the meeting continues text-only; `speak()` resolves immediately instead of throwing. Audio is an enhancement, never a dependency. A genuine per-turn TTS failure (ElevenLabs request errors, network failure, playback error) is different — that's not a permanent condition, so it rejects and surfaces the visible "audio unavailable" state instead of failing silently.
- **Speech recognition unavailable or fails** — only a genuinely unsupported browser (`SpeechRecognition` missing entirely, e.g. Safari) turns voice mode off for the session, with a visible notice to switch to typing. Every other failure (a no-speech timeout, a momentary permission hiccup, a network blip) just falls back to an idle, tappable mic — never a scary banner on every silence. If a network failure needs the user to resend what they said, the typing fallback is force-shown regardless of voice mode, so "your message is back in the box" is never a lie.

Never degrade silently. Every one of these gets a visible state.

---

## Component Rules

**Setup** — cert picker first; role and difficulty are meaningless without it. Cert options are derived from `CERT_REGISTRY`, never hand-listed, so adding a cert can't silently miss the picker. Scenario generation runs a multi-step tool-calling loop (5-15s) — a disabled button label alone isn't enough signal for that wait, so a full-screen `GeneratingOverlay` blocks the form and cycles through what the agent is actually doing (read scores → check seen combinations → target the weakest domain → write it). Blocking is correct here, not just tolerated — see Failure Behavior below.

**Brief** — show the tip only if present (beginner). Target domains as badges with human-readable names. Counterpart label driven by `config.counterpartRole`.

**Brief, loop transparency** — state why this scenario was chosen: _"Targeting Identity — you scored 45 here last session."_ Cheap to build, and it makes the agentic core legible to someone clicking through for ninety seconds instead of requiring them to run two full sessions and infer it. On the first session, say so plainly.

**MeetingRoom is a voice agent, not a chat app with voice attached.** There is no scrolling message-bubble transcript, and the type-and-send bar (`InputBar`) is never rendered alongside a live voice call — showing both at once is what makes an interface read as "chat" no matter how the rest of it looks. The loop: the mic auto-arms the moment it's genuinely the user's turn (not thinking, not speaking), auto-submits the instant the browser's own end-of-speech detection fires (no manual Send step in the voice path), the reply is spoken via ElevenLabs, proxied through `/api/speech` (full message at once, never token-by-token or streamed into playback — there's no partial-audio UI), and the mic re-arms. `CallStage`'s live caption of the current line is the exception, not a parallel channel: it only renders when audio genuinely isn't carrying the conversation — muted, TTS failed, or voice mode is off — never while a call is actively working. Disable input while generating; show `[ClientName] is thinking…` with a 1–2s delay — intentional pacing, do not remove it. Typing is always reachable as an explicit fallback (Safari has zero `SpeechRecognition` support), never hidden entirely. Mute kills the agent's audio, keeps text. "End Meeting" confirms first and aborts any in-flight mic capture.

**Debrief** — scores animate 0 → final. ≥80 green, 60–79 yellow, <60 red. Overall score is the largest element on screen.

**Dashboard** — one cert at a time with a switcher. Export / import / reset controls for the user model.

---

## Stack and Environment

Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, Ollama Cloud (`gpt-oss:120b`) via Vercel AI SDK, ElevenLabs for TTS (`speak()`, proxied server-side through `app/api/speech/route.ts` — see `lib/speech.ts`) and the Web Speech API for STT (`listen()`), `localStorage` for state, Vercel for hosting. No database.

`OLLAMA_API_KEY` and `ELEVENLABS_API_KEY` from `process.env`, server-side only. Never hardcode, never commit `.env`. `ELEVENLABS_API_KEY` never reaches the client bundle — `speak()` calls `/api/speech` rather than ElevenLabs directly. Per-persona ElevenLabs voice IDs (mapping `lib/schemas.ts`'s `voiceId` enum) come from their own env vars, resolved in `lib/ttsVoices.ts`; ElevenLabs is optional — with no key or an incomplete voice mapping, TTS is simply off and the meeting runs text-only (see Failure Behavior).

**Verify versions before writing agent code.** The AI SDK tool API (`inputSchema`, `stopWhen: isStepCount`) is major-version specific (this project is on AI SDK v7 — `stopWhen: stepCountIs` was renamed `isStepCount` in the v6→v7 migration) and the Ollama Cloud model catalog changes. Check `package.json` and confirm the model resolves rather than trusting this section.

---

## What NOT to Do

- Import a provider SDK inside `agents/`
- Read or write storage inside `agents/`
- Cast LLM output without schema validation
- Have the model echo back config values
- Write an unscoped domain score, or average scores across certs
- Send the whole user model where a projection would do
- Hardcode a scenario, or fall back to one when generation fails
- Correct the user mid-meeting
- Stream meeting responses token-by-token
- Remove the pacing delay
- Render a scrolling chat transcript, or show the typing fallback alongside an active voice call
- Put agent logic in components
- Show a raw domain ID
- Degrade silently on any failure

---

## Open Decisions

1. **Grader consistency** — the debrief agent is a grader, and an inconsistent grader makes the dashboard meaningless. Temperature 0.1 reduces variance without measuring it. Fixture transcripts scored 3× with an asserted spread is the missing piece — now that per-domain scores are a real per-domain average (see Agent Contracts — Debrief Agent) rather than the overall score broadcast to every exercised domain, the spread worth asserting is per-domain, not just on `overall`.

Longer-range plans (more certs, accounts/cross-device sync, provider portability) live in `ROADMAP.md`, not here — this section is for near-term implementation decisions, not the product backlog.
