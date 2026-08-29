# CloudDesk Multi-Cert Design Spec

**Date:** 2026-06-15
**Status:** Approved
**Scope:** Replace AWS SAA-C03 with 5 Azure Associate certifications. Per-cert progress tracking. User picks cert on setup screen. All agents and components calibrate to the selected cert.

---

## Goal

Expand CloudDesk from a single-cert (AWS SAA-C03) tool to a multi-cert tool supporting 5 Azure Associate certifications. Each cert has its own domain structure. Progress (domain scores, session history, seen scenario combinations) is tracked independently per cert so switching certs never resets unrelated progress.

---

## The 5 Certs

| Cert ID | Name |
|---|---|
| `az-104` | Azure Administrator Associate |
| `az-204` | Azure Developer Associate |
| `az-500` | Azure Security Engineer Associate |
| `az-700` | Azure Network Engineer Associate |
| `dp-300` | Azure Database Administrator Associate |

`aws-saa-c03.ts` is deleted. AWS SAA-C03 is no longer supported.

---

## Architecture: Registry Pattern

A single registry file (`data/domains/index.ts`) is the only import point for cert domain data. All consumers (prompts, components, userModel) import from the registry and look up by `certId`. No dynamic imports, no cert data in API payloads.

```typescript
// data/domains/index.ts
export const CERT_REGISTRY = {
  "az-104": { name: "Azure Administrator Associate", domains: AZ104_DOMAINS },
  "az-204": { name: "Azure Developer Associate",     domains: AZ204_DOMAINS },
  "az-500": { name: "Azure Security Engineer",       domains: AZ500_DOMAINS },
  "az-700": { name: "Azure Network Engineer",        domains: AZ700_DOMAINS },
  "dp-300": { name: "Azure Database Administrator",  domains: DP300_DOMAINS },
} as const;

export type CertId = keyof typeof CERT_REGISTRY;
```

---

## Domain File Shape

Each cert domain file follows the same shape as the current `aws-saa-c03.ts`:

```typescript
export const AZ104_DOMAINS = [
  {
    id: string,          // short kebab-case ID, e.g. "identities"
    name: string,        // human-readable, e.g. "Manage Azure Identities and Governance"
    weight: number,      // exam weight as decimal, e.g. 0.20 — must sum to 1.0 across all domains
    keyServices: string[],
    concepts: string[],
  },
  // ...
] as const;

export type AZ104DomainId = (typeof AZ104_DOMAINS)[number]["id"];
```

### AZ-104 Domains (Azure Administrator Associate)

| ID | Name | Weight |
|---|---|---|
| `identities` | Manage Azure Identities and Governance | 0.20 |
| `storage` | Implement and Manage Storage | 0.15 |
| `compute` | Deploy and Manage Azure Compute Resources | 0.20 |
| `networking` | Implement and Manage Virtual Networking | 0.25 |
| `monitoring` | Monitor and Maintain Azure Resources | 0.20 |

### AZ-204 Domains (Azure Developer Associate)

| ID | Name | Weight |
|---|---|---|
| `compute-solutions` | Develop Azure Compute Solutions | 0.25 |
| `storage-solutions` | Develop for Azure Storage | 0.15 |
| `security` | Implement Azure Security | 0.20 |
| `monitoring-solutions` | Monitor, Troubleshoot, and Optimize Azure Solutions | 0.15 |
| `third-party` | Connect to and Consume Azure Services and Third-Party Services | 0.25 |

### AZ-500 Domains (Azure Security Engineer Associate)

| ID | Name | Weight |
|---|---|---|
| `identity-access` | Manage Identity and Access | 0.25 |
| `network-security` | Secure Networking | 0.20 |
| `compute-security` | Secure Compute, Storage, and Databases | 0.25 |
| `security-ops` | Manage Security Operations | 0.30 |

### AZ-700 Domains (Azure Network Engineer Associate)

| ID | Name | Weight |
|---|---|---|
| `hybrid-connectivity` | Design, Implement, and Manage Hybrid Networking | 0.20 |
| `core-infra` | Design and Implement Core Networking Infrastructure | 0.20 |
| `routing` | Design and Implement Routing | 0.25 |
| `load-balancing` | Secure and Monitor Networks | 0.20 |
| `private-access` | Design and Implement Private Access to Azure Services | 0.15 |

### DP-300 Domains (Azure Database Administrator Associate)

| ID | Name | Weight |
|---|---|---|
| `plan-implement` | Plan and Implement Data Platform Resources | 0.20 |
| `secure-compliance` | Implement a Secure Environment | 0.15 |
| `monitor-optimize` | Monitor and Optimize Operational Resources | 0.20 |
| `query-performance` | Optimize Query Performance | 0.20 |
| `tasks-automation` | Perform Automation of Tasks | 0.10 |
| `ha-dr` | Plan and Implement a High Availability and Disaster Recovery Environment | 0.15 |

---

## Type Changes (`lib/types.ts`)

### `SessionConfig` — add `cert`

```typescript
export type SessionConfig = {
  userId: string;
  cert: CertId;
  role: "solutions-architect" | "senior-developer" | "team-lead";
  counterpartRole: "client" | "non-tech" | "junior-dev" | "team-engineer";
  difficulty: "beginner" | "intermediate" | "expert";
};
```

### `ScenarioOutput` — add `cert`

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
  cert: CertId;
};
```

### `UserModel` — restructure to per-cert

```typescript
export type CertProgress = {
  domainScores: Record<string, number>;  // domain IDs are cert-specific
  sessions: SessionRecord[];
  seenCombinations: string[];
};

export type UserModel = {
  userId: string;
  certs: Partial<Record<CertId, CertProgress>>;
};
```

`DomainScores` as a named type is removed. `Partial<Record<CertId, CertProgress>>` — cert slices are created on first access, not pre-initialized.

---

## UserModel Changes (`lib/userModel.ts`)

```typescript
import { CERT_REGISTRY, type CertId } from "@/data/domains";

function initCertProgress(certId: CertId): CertProgress {
  const domains = CERT_REGISTRY[certId].domains;
  const domainScores = Object.fromEntries(domains.map(d => [d.id, 50]));
  return { domainScores, sessions: [], seenCombinations: [] };
}

export function readUserModel(userId: string): UserModel
// reads from sessionStorage "clouddesk:userModel"
// if absent or missing .certs key (stale v1 data), returns fresh { userId, certs: {} }

export function getCertProgress(userModel: UserModel, certId: CertId): CertProgress
// returns userModel.certs[certId] ?? initCertProgress(certId)
// does NOT mutate userModel — callers pass it to tools/agents as-is

export function updateUserModel(userId: string, certId: CertId, session: SessionResult): void
// reads current model, updates certs[certId] slice, writes back to sessionStorage

export function pickWeakestDomain(certProgress: CertProgress): string
// returns the domain ID with the lowest score in certProgress.domainScores
```

**Stale data guard:** If `sessionStorage` has a `UserModel` without a `certs` key (old v1 shape), `readUserModel` discards it and returns a fresh model. No migration needed — scores reset.

---

## Adapter Changes (`lib/llm.ts`, `lib/tools.ts`)

### `lib/tools.ts`

`buildScenarioTools(certProgress: CertProgress)` — third arg changes from `UserModel` to `CertProgress`. The tools only ever needed the cert slice:

```typescript
export function buildScenarioTools(certProgress: CertProgress) {
  return {
    readDomainScores: tool({ ..., execute: async () => certProgress.domainScores }),
    listSeenCombinations: tool({ ..., execute: async () => certProgress.seenCombinations }),
    validateScenario: tool({ ... }),  // logic unchanged
  };
}
```

### `lib/llm.ts`

`callLLMWithTools(systemPrompt, messages, certProgress: CertProgress, opts)` — third arg changes from `UserModel` to `CertProgress` to match `buildScenarioTools`.

---

## Prompt Changes

### `prompts/scenarioAgent.ts`

`buildScenarioPrompt(role, counterpartRole, certId: CertId)` — third arg added.

- Imports `CERT_REGISTRY` from `@/data/domains`
- Builds domain list from `CERT_REGISTRY[certId].domains` instead of `SAA_DOMAINS`
- Prompt header: "You are a scenario generator for **[cert name] ([cert ID])**..."
- `cert` field added to the JSON schema: must exactly match `certId`

### `prompts/debriefAgent.ts`

Both functions gain `certId`:

- `buildExchangeAnalysisPrompt(scenario: ScenarioOutput, certId: CertId)`
- `buildDebriefPrompt(scenario: ScenarioOutput, analysisText: string, certId: CertId)`

Both look up `CERT_REGISTRY[certId].domains` to inject domain names and weights. Domain IDs in `domainsExercised` output are cert-specific strings.

### `prompts/meetingAgent.ts`

**No changes.** The meeting prompt is cert-agnostic.

---

## Agent Changes

### `agents/scenarioAgent.ts`

```typescript
export async function scenarioAgent(
  config: SessionConfig,
  userModel: UserModel,
): Promise<ScenarioOutput> {
  const certProgress = getCertProgress(userModel, config.cert);
  const systemPrompt = buildScenarioPrompt(config.role, config.counterpartRole, config.cert);
  const raw = await callLLMWithTools(
    systemPrompt,
    [{ role: "user", content: `Generate a ${config.difficulty} scenario for a ${config.role} talking to a ${config.counterpartRole}.` }],
    certProgress,   // ← was userModel
    { temperature: 0.9 },
  );
  return JSON.parse(stripFences(raw)) as ScenarioOutput;
}
```

### `agents/debriefAgent.ts`

`scenario.cert` is available on the scenario — no signature change. Both prompt calls gain `scenario.cert`. `updateUserModel` call gains `scenario.cert` as second arg.

---

## UI Changes

### `app/page.tsx`

Cert picker added above the role picker — 5 buttons, one per cert. Default: `"az-104"`.

Stale data guard: before passing `userModel` to the API, check `userModel.certs !== undefined`. If missing (old shape), reinitialize to `{ userId, certs: {} }`.

`SessionConfig` sent to `/api/scenario` includes `cert`.

### `components/Brief/BriefCard.tsx`

Replace `SAA_DOMAINS` import with `CERT_REGISTRY`. Look up domains via `CERT_REGISTRY[scenario.cert].domains` to resolve domain IDs to human-readable names for the target domain badges.

### `components/Debrief/ExamIntel.tsx`

Same pattern: replace `SAA_DOMAINS` with `CERT_REGISTRY[scenario.cert].domains`.

### `components/Dashboard/DomainBars.tsx`

Accept `certId` prop. Look up `CERT_REGISTRY[certId].domains` to know which bars to render. Read scores from `userModel.certs[certId]?.domainScores ?? {}`. If no progress exists for the cert yet, render all bars at 50.

---

## Files Changed

| Action | File |
|---|---|
| Create | `data/domains/az-104.ts` |
| Create | `data/domains/az-204.ts` |
| Create | `data/domains/az-500.ts` |
| Create | `data/domains/az-700.ts` |
| Create | `data/domains/dp-300.ts` |
| Create | `data/domains/index.ts` |
| Delete | `data/domains/aws-saa-c03.ts` |
| Modify | `lib/types.ts` |
| Modify | `lib/userModel.ts` |
| Modify | `lib/tools.ts` |
| Modify | `lib/llm.ts` |
| Modify | `agents/scenarioAgent.ts` |
| Modify | `agents/debriefAgent.ts` |
| Modify | `prompts/scenarioAgent.ts` |
| Modify | `prompts/debriefAgent.ts` |
| Modify | `app/page.tsx` |
| Modify | `components/Brief/BriefCard.tsx` |
| Modify | `components/Debrief/ExamIntel.tsx` |
| Modify | `components/Dashboard/DomainBars.tsx` |

## Files Unchanged

`prompts/meetingAgent.ts`, `agents/meetingAgent.ts`, `agents/orchestrator.ts`, `app/api/scenario/route.ts`, `app/api/meeting/route.ts`, `app/api/debrief/route.ts`, all other components.
