# CloudDesk Design Spec

**Date:** 2026-06-08  
**Hackathon:** Microsoft Agents League 2026 — Reasoning Agents track  
**Deadline:** June 14, 2026

---

## What We're Building

A multi-agent AWS SAA-C03 certification prep web app. Users practice as a senior cloud role (Solutions Architect) in a simulated client meeting. Three coordinated AI agents handle the session lifecycle, forming a feedback loop where each session makes the next one harder and more targeted.

**The agentic core:** Debrief Agent grades the transcript → updates the User Model → Scenario Agent reads it next session → generates a scenario targeting the user's weakest domain. The loop must be demonstrable across 2+ sessions for the hackathon.

**Primary demo mode:** Self-serve (judge runs it themselves). Prioritize clear onboarding and a visible adaptive loop on the dashboard.

---

## Architecture

### Runtime split

| Layer | Where it runs | Why |
|---|---|---|
| Next.js pages + components | Browser | UI, navigation, state |
| `lib/speech.ts` (TTS/STT) | Browser | Web Speech API is browser-only |
| `lib/llm.ts` + agents | Server (API routes) | Keeps Gemini API key off the client |
| `lib/userModel.ts` | Browser (sessionStorage) | No backend needed |

### Request flow

```
Browser (page)
  → fetch('/api/scenario') → agents/scenarioAgent.ts → lib/llm.ts → Gemini
  → fetch('/api/meeting')  → agents/meetingAgent.ts  → lib/llm.ts → Gemini
  → fetch('/api/debrief')  → agents/debriefAgent.ts  → lib/llm.ts → Gemini
```

Session state lives in `sessionStorage` and is threaded through pages via query params (scenario ID) + direct sessionStorage reads. No database.

### The adapter rule

`lib/llm.ts` and `lib/speech.ts` are the **only** files that know which LLM/speech provider is used. All agents call `callLLM()`. All components call `speak()` / `listen()`. The June 4 Azure swap touches only these two files.

---

## Pages

| Route | Purpose | Key data |
|---|---|---|
| `/` | Role selection + start session | Writes `sessionConfig` to sessionStorage |
| `/brief` | Pre-meeting brief | Reads `scenario` from sessionStorage |
| `/meeting` | Live meeting room | Streams meeting via `/api/meeting` |
| `/debrief` | Graded breakdown | Reads debrief from sessionStorage |
| `/dashboard` | Session history + domain scores | Reads full userModel from sessionStorage |

---

## Components

### MeetingRoom
- `ChatPanel` — message list, auto-scrolls
- `AvatarPanel` — client avatar, "thinking..." indicator (1–2s intentional delay)
- `InputBar` — text input + mic button (Web Speech STT)
- `MeetingHeader` — timer, end-meeting button (with confirmation dialog)

**Rules:** Disable input while agent is generating. Full message → thinking indicator → display → `speak()`. No token streaming.

### Brief
- `BriefCard` — client name/title/company most prominent; domain badges (human-readable names, colored); tip block (beginner only)
- `JoinButton` — click → "Connecting..." (500ms) → fade to `/meeting`; first agent message fires on meeting room mount

### Debrief
- `ScoreCard` — scores animate 0→final on load; ≥80 green, 60–79 yellow, <60 red; overall score largest
- `MomentReplay` — exchange-by-exchange annotations (good/incomplete/missed)
- `ExamIntel` — domains exercised, example exam question, key concepts
- `StudyNext` — weak areas, suggested topics, suggested next scenario

### Dashboard
- Domain score bars with callout: "Weakest domain: [Name] (42%) — your next session targets this"
- Session history list (date, scenario, overall score)
- "Start New Session" button

---

## Agents

### Scenario Agent
- **Input:** userId, SessionConfig
- **Reads:** userModel from sessionStorage (via API route body)
- **Logic:** Pick weakest domain → build prompt with history + seen combinations → call callLLM(json:true) → validate domain coverage → regenerate up to 2x on failure
- **Output:** `ScenarioOutput` (see types)

### Meeting Agent
- **Input:** scenario, config, message history
- **Logic:** Full history → callLLM() → return next message text
- **Rules:** One question per message, push back on vague answers, inject curveball after exchange 5–8, never correct user, wrap after 10–15 exchanges
- **Output:** string (the client's reply)

### Debrief Agent
- **Input:** transcript, scenario, userId
- **Logic:** callLLM(json:true, temperature:0.2) → parse → updateUserModel()
- **Output:** `DebriefOutput` (see types)
- **Side effect:** Calls `updateUserModel()` — this IS the feedback loop

---

## State + Types

```typescript
// sessionStorage keys
const KEYS = {
  config: 'clouddesk:config',
  scenario: 'clouddesk:scenario',
  transcript: 'clouddesk:transcript',
  debrief: 'clouddesk:debrief',
  userModel: 'clouddesk:userModel',
}
```

UserModel stored in sessionStorage under `clouddesk:userModel`. Domain scores are rolling weighted averages. `seenCombinations` is `"industry:problem"` strings preventing repeats.

---

## TTS / STT

**TTS:** `window.speechSynthesis` via Web Speech API. `speak(text, voiceId)` maps voiceId (e.g. `"af_sarah"`) to the closest available browser voice (female English). Mute toggle skips `speak()` call.

**STT:** `window.SpeechRecognition` — same as specced. Triggered by mic button in InputBar.

**Azure swap (June 4):** Only `lib/speech.ts` changes. Agents and components are untouched.

---

## Tech Stack (Phase A)

| Layer | Tool |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| LLM | Google Gemini 2.5 Flash via `@google/genai` |
| TTS | `window.speechSynthesis` (Web Speech API) |
| STT | `window.SpeechRecognition` (Web Speech API) |
| Hosting | Vercel |
| State | sessionStorage |

---

## Rate Limit Mitigations (Gemini Free Tier ~10 RPM)

- 500ms gap between scenario init and meeting room mount
- Meeting agent fires once per user message (naturally throttled)
- Debrief fires once at session end
- No re-fetching: all state cached in sessionStorage

---

## Definition of Done (Phase A)

- [ ] Full flow: setup → brief → meeting (5+ exchanges) → debrief
- [ ] Scenario Agent targets weakest domain (provable across 2 sessions)
- [ ] Meeting Agent maintains persona, one Q at a time, injects curveball
- [ ] Debrief Agent scores all four SAA-C03 domains, updates userModel
- [ ] Feedback loop: session 2 scenario reflects session 1's weak domain
- [ ] TTS speaks every agent message (speechSynthesis)
- [ ] All provider access isolated to `lib/llm.ts` and `lib/speech.ts`
- [ ] Dashboard shows domain scores + adaptive callout
- [ ] Deployed on Vercel
