# Roadmap

Where CloudDesk goes from here. Not a promise or a timeline — a running list of what's actually worth building next, roughly ordered by how much it builds on what already exists versus how much new architecture it needs.

For near-term implementation decisions on the current architecture, see `CLAUDE.md`'s "Open Decisions" instead — this file is the product backlog, that one is the engineering one.

---

## More certification practice

Currently: five Azure Associate certs (AZ-104, AZ-204, AZ-500, AZ-700, DP-300), all sharing one cert-agnostic agent pipeline. Adding another Azure cert is already cheap by design — one domain-data file in `data/domains/`, one entry in `CERT_REGISTRY` (`data/domains/index.ts`) — no agent, prompt, or storage changes required. That's proven; the loop generalizes.

What's actually left to do here:

- **More Azure certs** — Azure Solutions Architect Expert (AZ-305), Azure DevOps Engineer Expert (AZ-400), the Fundamentals tier (AZ-900) as an easier entry point. Straightforward: write the domain data, register it.
- **A second cloud provider (AWS, GCP)** — this is a bigger claim than it looks. The Scenario Agent's prompt already reconciles role↔cert framing generically (a Solutions Architect studying an admin-focused exam gets admin-shaped scenarios, not generic system design — see `buildScenarioPrompt`), so the mechanism should transfer. What doesn't transfer for free: `keyServices`/`concepts` per domain are Azure-vocabulary today, and the `AZURE_SERVICE_PATTERN` regex in `lib/tools.ts` that keeps service names out of `problemStatement` is literally Azure-specific — it'd need a provider-aware version (or a provider field the pattern is selected from) before an AWS cert could ship correctly.
- **Cert-agnostic "coming soon" state** — `CLAUDE.md` already specifies "certs with no domain data yet are visibly disabled, not hidden," but there's currently no data structure for a *planned-but-not-implemented* cert to render that state — `CERT_REGISTRY` only contains certs that already have real domain data. Needs a lightweight `PLANNED_CERTS` list (id + display name, no domain data) that the setup picker renders as disabled tiles.

## Accounts and cross-device progress

Currently: progress lives entirely in `localStorage`, keyed by a generated `userId` that never leaves the device. No server ever sees it except the one request per session that computes a scenario or a debrief — see `CLAUDE.md`'s Hard Invariants. This is genuinely nice (zero setup, works in private browsing, no data-handling liability) and shouldn't be lost as a *mode*, even if accounts get added.

What sign-up/sync would actually require:

- **Auth** — something like Clerk, Auth.js, or Supabase Auth. Email or OAuth; no password-reset infrastructure to hand-roll.
- **A real database** replacing `localStorage` as the source of truth for signed-in users — `UserModel`/`CertProgress` (`lib/types.ts`) are already a clean serializable shape, so this is closer to "point the same shape at Postgres" than a redesign. `lib/userModel.ts` is already the single seam that touches storage (Hard Invariant #4) — a signed-in path adds a second backend behind that same seam, it doesn't dissolve the boundary.
- **A migration path for existing local-only users** — `exportUserModel`/`importUserModel` (`lib/userModel.ts`) already exist for the dashboard's export/import buttons. Signing up should be able to reuse exactly that: export local progress, import it into the new account, done. This is most of the "migrate to an account" feature already sitting there for a different reason.
- **Decide what happens to the local-only mode** — probably: keep it as the no-signup default, offer an account as opt-in for people who want cross-device history. Never make an account mandatory to try the product once.

## Also worth doing, smaller

Things that don't need new architecture, just time:

- **Rate limiting on the API routes.** Fine as an accepted risk for a personal deployment behind a not-widely-shared URL; not fine the moment this is a public GitHub repo someone could deploy and get their `OLLAMA_API_KEY` quota drained through. Worth adding before/if this gets a real public deployment, not before then.
- **A full mobile pass.** The premium visual redesign was verified at desktop width only. Nothing about the architecture assumes desktop, but nothing's been checked below ~768px either — bento grids, the floating nav pill, and the call-stage layout in particular need an actual look.
- **Grader consistency measurement** — already named in `CLAUDE.md`'s Open Decisions: score the same fixture transcript through the debrief agent 3× and assert the spread is small. Temperature 0.1 is a guess at low variance, not a measured one.
- **Voice agent polish** — right now each turn is one-shot (`SpeechRecognition` with `continuous: false`); it can't be interrupted mid-reply the way a real call can. Barge-in (stopping the agent's TTS the moment the user starts talking over it) would close a real gap between "voice agent" and "an actual phone call."
- **Provider portability** — the LLM boundary is already collapsed to one file (`lib/llm.ts`, Hard Invariant #1), specifically so a provider swap (this project has already done one, Gemini → Ollama Cloud) touches one file instead of every agent. Worth keeping true as new models come out, not worth abstracting further pre-emptively.

## Deliberately not planned

- **Streaming meeting responses token-by-token.** Explicitly against `CLAUDE.md` — the full reply is spoken via TTS as one utterance; there's no model to preload, and a token-by-token UI would just be chat-app theater with nothing behind it.
- **A generic "any exam" mode.** The value of the loop is scenarios that actually target real, weighted exam domains. A cert with no real domain data behind it would be indistinguishable from a fallback scenario — which `CLAUDE.md` already rules out as silently breaking the loop.
