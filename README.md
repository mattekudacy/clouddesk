# CloudDesk

A multi-agent Azure certification prep tool. You practice as a senior role — Solutions Architect, Senior Developer, or Team Lead — in a simulated client call, then get graded against the certification's actual exam domains. The next session automatically targets whatever you were weakest on.

This is a personal project: a study tool for my own Azure certification prep, an agentic-app sandbox, and a portfolio piece. See [`CLAUDE.md`](./CLAUDE.md) for the full architecture and invariants, and [`ROADMAP.md`](./ROADMAP.md) for what's planned next.

## How it works

Three agents run the session lifecycle:

1. **Scenario Agent** — tool-calling; reads your domain scores for the active cert (weight-adjusted, so a mediocre score in a heavily-weighted domain outranks a poor score in a minor one), avoids repeating scenarios you've already seen, generates the highest-value next scenario.
2. **Meeting Agent** — plays the counterpart persona, calibrated to your role and difficulty (a curious layperson, a business stakeholder, or a senior engineer who pushes back). Runs as an actual voice agent — the mic listens and auto-submits once you stop talking, the reply is spoken aloud, and it re-arms for your next turn. Typing is always available as a fallback (Safari has no Web Speech API `SpeechRecognition` support at all, so voice can never be the only path).
3. **Debrief Agent** — scores your responses against the cert's real exam domains, then updates your progress. Scores blend as an exponential moving average (α = 0.4) so recent sessions dominate — improvement is visible within two or three sessions, not diluted by early attempts.

The feedback loop is the actual product: a debrief produces a delta → your local progress model absorbs it → the next Scenario Agent run reads it and targets differently. Two sessions back to back should visibly target different domains.

## Stack

Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, [Ollama Cloud](https://ollama.com) (`gpt-oss:120b`) via the Vercel AI SDK, the Web Speech API for both TTS and STT (no separate voice model to load), `localStorage` for progress — no database, no accounts, everything stays on your device.

## Running locally

```bash
npm install
```

Set an Ollama Cloud API key in `.env.local`:

```
OLLAMA_API_KEY=your-key-here
```

Then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Certifications currently covered: AZ-104, AZ-204, AZ-500, AZ-700, DP-300 — adding another is one domain-data file plus one registry entry in `data/domains/index.ts`, no changes to agents, prompts, or UI required.

## Testing

```bash
npm test
```

Zod schemas validate every LLM output before it reaches an agent (`lib/schemas.ts`) and every API request body before it reaches an agent (`lib/requestSchemas.ts`) — see `CLAUDE.md`'s "LLM Boundary" section for why that boundary is treated as strictly as it is.
