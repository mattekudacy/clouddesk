# Multi-Cert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AWS SAA-C03 with 5 Azure Associate certifications, with per-cert progress tracking and a cert picker on the setup screen.

**Architecture:** A `CERT_REGISTRY` in `data/domains/index.ts` is the single import point for all cert domain data. `SessionConfig` and `ScenarioOutput` gain a `cert` field. `UserModel` restructures from a flat object to `certs: Partial<Record<CertId, CertProgress>>` so each cert's scores, sessions, and seen combinations are tracked independently. The service-name validator in tools.ts is updated for Azure services.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, existing Vercel AI SDK adapter.

---

## File Map

| Action | File | What changes |
|---|---|---|
| Create | `data/domains/az-104.ts` | AZ-104 domain definitions |
| Create | `data/domains/az-204.ts` | AZ-204 domain definitions |
| Create | `data/domains/az-500.ts` | AZ-500 domain definitions |
| Create | `data/domains/az-700.ts` | AZ-700 domain definitions |
| Create | `data/domains/dp-300.ts` | DP-300 domain definitions |
| Create | `data/domains/index.ts` | CERT_REGISTRY + CertId type |
| Delete | `data/domains/aws-saa-c03.ts` | Removed entirely |
| Modify | `lib/types.ts` | Add CertId import, add cert to SessionConfig + ScenarioOutput, restructure UserModel |
| Modify | `lib/userModel.ts` | Per-cert read/write/init, stale-data guard |
| Modify | `lib/tools.ts` | Accept CertProgress instead of UserModel, update Azure service validator |
| Modify | `lib/llm.ts` | Third arg changes from UserModel to CertProgress |
| Modify | `agents/scenarioAgent.ts` | Pass config.cert; resolve certProgress from userModel |
| Modify | `agents/debriefAgent.ts` | Pass scenario.cert to both prompt builders and updateUserModel |
| Modify | `prompts/scenarioAgent.ts` | Add certId param, import CERT_REGISTRY, inject cert name/domains |
| Modify | `prompts/debriefAgent.ts` | Add certId param, import CERT_REGISTRY, inject cert domains/weights |
| Modify | `app/page.tsx` | Add cert picker, stale-data guard, pass cert in config |
| Modify | `components/Brief/BriefCard.tsx` | Use CERT_REGISTRY[scenario.cert].domains for badge lookup |
| Modify | `components/Debrief/ExamIntel.tsx` | Use CERT_REGISTRY[scenario.cert].domains for domain name lookup |
| Modify | `components/Dashboard/DomainBars.tsx` | Accept certId + domainScores props; look up domains from registry |
| Modify | `app/dashboard/page.tsx` | Pass certId to DomainBars, read certProgress from new UserModel shape |

---

## Task 1: Create domain files and registry

**Files:**
- Create: `data/domains/az-104.ts`
- Create: `data/domains/az-204.ts`
- Create: `data/domains/az-500.ts`
- Create: `data/domains/az-700.ts`
- Create: `data/domains/dp-300.ts`
- Create: `data/domains/index.ts`

- [ ] **Step 1: Create `data/domains/az-104.ts`**

```typescript
export const AZ104_DOMAINS = [
  {
    id: "identities",
    name: "Manage Azure Identities and Governance",
    weight: 0.20,
    keyServices: ["Azure AD", "RBAC", "Azure Policy", "Management Groups", "Subscriptions"],
    concepts: ["identity management", "role assignments", "governance", "compliance", "resource locks"],
  },
  {
    id: "storage",
    name: "Implement and Manage Storage",
    weight: 0.15,
    keyServices: ["Azure Blob Storage", "Azure Files", "Azure Storage Accounts", "Azure Import/Export"],
    concepts: ["storage tiers", "replication", "access keys", "shared access signatures", "lifecycle policies"],
  },
  {
    id: "compute",
    name: "Deploy and Manage Azure Compute Resources",
    weight: 0.20,
    keyServices: ["Azure VMs", "Azure App Service", "Azure Container Instances", "Azure Kubernetes Service", "Azure Functions"],
    concepts: ["VM sizing", "availability sets", "scale sets", "deployment slots", "containerization"],
  },
  {
    id: "networking",
    name: "Implement and Manage Virtual Networking",
    weight: 0.25,
    keyServices: ["Azure VNet", "Network Security Groups", "Azure DNS", "VPN Gateway", "Azure Load Balancer"],
    concepts: ["subnets", "peering", "routing", "DNS resolution", "network security", "private endpoints"],
  },
  {
    id: "monitoring",
    name: "Monitor and Maintain Azure Resources",
    weight: 0.20,
    keyServices: ["Azure Monitor", "Log Analytics", "Azure Alerts", "Azure Backup", "Azure Site Recovery"],
    concepts: ["metrics", "log queries", "backup policies", "disaster recovery", "cost management"],
  },
] as const;

export type AZ104DomainId = (typeof AZ104_DOMAINS)[number]["id"];
```

- [ ] **Step 2: Create `data/domains/az-204.ts`**

```typescript
export const AZ204_DOMAINS = [
  {
    id: "compute-solutions",
    name: "Develop Azure Compute Solutions",
    weight: 0.25,
    keyServices: ["Azure Functions", "Azure App Service", "Azure Container Apps", "Azure Kubernetes Service"],
    concepts: ["serverless", "containerization", "deployment slots", "scaling", "triggers and bindings"],
  },
  {
    id: "storage-solutions",
    name: "Develop for Azure Storage",
    weight: 0.15,
    keyServices: ["Azure Blob Storage", "Azure Cosmos DB", "Azure SQL", "Azure Cache for Redis", "Azure Table Storage"],
    concepts: ["data consistency", "caching", "partitioning", "indexing", "data access patterns"],
  },
  {
    id: "security",
    name: "Implement Azure Security",
    weight: 0.20,
    keyServices: ["Azure Key Vault", "Azure AD", "Managed Identities", "Azure API Management"],
    concepts: ["secrets management", "OAuth2", "managed identity", "API security", "certificate management"],
  },
  {
    id: "monitoring-solutions",
    name: "Monitor, Troubleshoot, and Optimize Azure Solutions",
    weight: 0.15,
    keyServices: ["Azure Application Insights", "Azure Monitor", "Azure Log Analytics"],
    concepts: ["distributed tracing", "performance tuning", "logging", "alerting", "caching strategies"],
  },
  {
    id: "third-party",
    name: "Connect to and Consume Azure Services and Third-Party Services",
    weight: 0.25,
    keyServices: ["Azure Service Bus", "Azure Event Grid", "Azure Event Hubs", "Azure API Management", "Azure Logic Apps"],
    concepts: ["message queues", "event-driven architecture", "webhooks", "API versioning", "integration patterns"],
  },
] as const;

export type AZ204DomainId = (typeof AZ204_DOMAINS)[number]["id"];
```

- [ ] **Step 3: Create `data/domains/az-500.ts`**

```typescript
export const AZ500_DOMAINS = [
  {
    id: "identity-access",
    name: "Manage Identity and Access",
    weight: 0.25,
    keyServices: ["Azure AD", "Azure AD B2C", "Privileged Identity Management", "Conditional Access", "Azure AD Connect"],
    concepts: ["zero trust", "least privilege", "MFA", "conditional access policies", "identity governance"],
  },
  {
    id: "network-security",
    name: "Secure Networking",
    weight: 0.20,
    keyServices: ["Azure Firewall", "Azure DDoS Protection", "Network Security Groups", "Azure Bastion", "Azure Private Link"],
    concepts: ["network segmentation", "DDoS mitigation", "perimeter security", "private connectivity", "traffic inspection"],
  },
  {
    id: "compute-security",
    name: "Secure Compute, Storage, and Databases",
    weight: 0.25,
    keyServices: ["Azure Key Vault", "Azure Disk Encryption", "Azure Security Center", "Azure Defender", "Storage Service Encryption"],
    concepts: ["encryption at rest", "encryption in transit", "vulnerability management", "security posture", "just-in-time access"],
  },
  {
    id: "security-ops",
    name: "Manage Security Operations",
    weight: 0.30,
    keyServices: ["Microsoft Sentinel", "Azure Security Center", "Azure Monitor", "Azure Policy", "Microsoft Defender for Cloud"],
    concepts: ["SIEM", "threat detection", "incident response", "compliance management", "security automation"],
  },
] as const;

export type AZ500DomainId = (typeof AZ500_DOMAINS)[number]["id"];
```

- [ ] **Step 4: Create `data/domains/az-700.ts`**

```typescript
export const AZ700_DOMAINS = [
  {
    id: "hybrid-connectivity",
    name: "Design, Implement, and Manage Hybrid Networking",
    weight: 0.20,
    keyServices: ["Azure VPN Gateway", "Azure ExpressRoute", "Azure Virtual WAN", "Azure Route Server"],
    concepts: ["site-to-site VPN", "point-to-site VPN", "ExpressRoute circuits", "BGP routing", "hybrid connectivity"],
  },
  {
    id: "core-infra",
    name: "Design and Implement Core Networking Infrastructure",
    weight: 0.20,
    keyServices: ["Azure Virtual Network", "Azure DNS", "Azure DDoS Protection", "Azure Firewall", "Network Security Groups"],
    concepts: ["VNet design", "IP addressing", "DNS resolution", "network segmentation", "hub-spoke topology"],
  },
  {
    id: "routing",
    name: "Design and Implement Routing",
    weight: 0.25,
    keyServices: ["Azure Route Tables", "Azure Route Server", "Azure Virtual WAN", "Border Gateway Protocol"],
    concepts: ["user-defined routes", "system routes", "BGP", "route propagation", "traffic management"],
  },
  {
    id: "load-balancing",
    name: "Secure and Monitor Networks",
    weight: 0.20,
    keyServices: ["Azure Load Balancer", "Azure Application Gateway", "Azure Front Door", "Azure Traffic Manager", "Azure Network Watcher"],
    concepts: ["load balancing algorithms", "WAF", "network monitoring", "packet capture", "connection troubleshooting"],
  },
  {
    id: "private-access",
    name: "Design and Implement Private Access to Azure Services",
    weight: 0.15,
    keyServices: ["Azure Private Link", "Azure Private Endpoint", "Azure Service Endpoints", "Azure App Service VNet Integration"],
    concepts: ["private endpoints", "service endpoints", "DNS private zones", "network isolation", "data exfiltration prevention"],
  },
] as const;

export type AZ700DomainId = (typeof AZ700_DOMAINS)[number]["id"];
```

- [ ] **Step 5: Create `data/domains/dp-300.ts`**

```typescript
export const DP300_DOMAINS = [
  {
    id: "plan-implement",
    name: "Plan and Implement Data Platform Resources",
    weight: 0.20,
    keyServices: ["Azure SQL Database", "Azure SQL Managed Instance", "Azure Database for PostgreSQL", "Azure Database for MySQL"],
    concepts: ["deployment options", "service tiers", "elastic pools", "migration strategies", "hybrid scenarios"],
  },
  {
    id: "secure-compliance",
    name: "Implement a Secure Environment",
    weight: 0.15,
    keyServices: ["Azure AD authentication", "Azure Key Vault", "Transparent Data Encryption", "Always Encrypted", "Azure Defender for SQL"],
    concepts: ["database authentication", "encryption at rest", "dynamic data masking", "auditing", "Advanced Threat Protection"],
  },
  {
    id: "monitor-optimize",
    name: "Monitor and Optimize Operational Resources",
    weight: 0.20,
    keyServices: ["Azure Monitor", "Query Performance Insight", "Azure SQL Analytics", "Intelligent Performance"],
    concepts: ["performance monitoring", "resource utilization", "automatic tuning", "alerts", "database advisors"],
  },
  {
    id: "query-performance",
    name: "Optimize Query Performance",
    weight: 0.20,
    keyServices: ["Query Store", "Execution Plans", "Index Advisor", "Automatic Tuning", "In-Memory OLTP"],
    concepts: ["query tuning", "indexing strategies", "statistics", "execution plan analysis", "blocking and deadlocks"],
  },
  {
    id: "tasks-automation",
    name: "Perform Automation of Tasks",
    weight: 0.10,
    keyServices: ["Azure Automation", "SQL Agent", "Elastic Jobs", "Azure Logic Apps", "Azure Data Factory"],
    concepts: ["scheduled jobs", "maintenance tasks", "index maintenance", "backup automation", "runbooks"],
  },
  {
    id: "ha-dr",
    name: "Plan and Implement High Availability and Disaster Recovery",
    weight: 0.15,
    keyServices: ["Always On Availability Groups", "Azure SQL Geo-Replication", "Failover Groups", "Azure Backup", "Long-Term Retention"],
    concepts: ["RTO", "RPO", "failover", "geo-redundancy", "backup and restore", "business continuity"],
  },
] as const;

export type DP300DomainId = (typeof DP300_DOMAINS)[number]["id"];
```

- [ ] **Step 6: Create `data/domains/index.ts`**

```typescript
import { AZ104_DOMAINS } from "./az-104";
import { AZ204_DOMAINS } from "./az-204";
import { AZ500_DOMAINS } from "./az-500";
import { AZ700_DOMAINS } from "./az-700";
import { DP300_DOMAINS } from "./dp-300";

export const CERT_REGISTRY = {
  "az-104": { name: "Azure Administrator Associate", domains: AZ104_DOMAINS },
  "az-204": { name: "Azure Developer Associate", domains: AZ204_DOMAINS },
  "az-500": { name: "Azure Security Engineer Associate", domains: AZ500_DOMAINS },
  "az-700": { name: "Azure Network Engineer Associate", domains: AZ700_DOMAINS },
  "dp-300": { name: "Azure Database Administrator Associate", domains: DP300_DOMAINS },
} as const;

export type CertId = keyof typeof CERT_REGISTRY;

// Helper: get a domain's human-readable name within a cert
export function getDomainName(certId: CertId, domainId: string): string {
  const domain = (CERT_REGISTRY[certId].domains as readonly { id: string; name: string }[])
    .find((d) => d.id === domainId);
  return domain?.name ?? domainId;
}
```

- [ ] **Step 7: Check TypeScript compiles (only the new files)**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: errors about missing `CertId` in `lib/types.ts` and stale imports in other files — those are cascade errors fixed in later tasks. No errors inside the new `data/domains/` files themselves.

- [ ] **Step 8: Commit**

```bash
cd /Users/cmante/Documents/root/clouddesk
git add data/domains/az-104.ts data/domains/az-204.ts data/domains/az-500.ts data/domains/az-700.ts data/domains/dp-300.ts data/domains/index.ts
git commit -m "feat: add 5 Azure cert domain files and CERT_REGISTRY"
```

---

## Task 2: Update `lib/types.ts`

**Files:**
- Modify: `lib/types.ts`

Add `CertId` import. Add `cert: CertId` to `SessionConfig` and `ScenarioOutput`. Replace `DomainScores` + flat `UserModel` with `CertProgress` + per-cert `UserModel`. Keep all other types unchanged.

- [ ] **Step 1: Replace the entire file**

```typescript
import type { CertId } from "@/data/domains";

export type Message = { role: "user" | "assistant"; content: string };
export type LLMOpts = { temperature?: number; json?: boolean };

export type SessionConfig = {
  userId: string;
  cert: CertId;
  role: "solutions-architect" | "senior-developer" | "team-lead";
  counterpartRole: "client" | "non-tech" | "junior-dev" | "team-engineer";
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
  counterpartRole: "client" | "non-tech" | "junior-dev" | "team-engineer";
  cert: CertId;
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

export type SessionResult = {
  sessionId: string;
  date: number;
  scenario: ScenarioOutput;
  scores: DebriefOutput["scores"];
  domainsExercised: string[];
};

export type CertProgress = {
  domainScores: Record<string, number>;
  sessions: SessionResult[];
  seenCombinations: string[];
};

export type UserModel = {
  userId: string;
  certs: Partial<Record<CertId, CertProgress>>;
};
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: cascade errors in `lib/userModel.ts`, `lib/tools.ts`, `lib/llm.ts`, `agents/`, `prompts/`, `components/`, and `app/`. No errors inside `lib/types.ts` or `data/domains/` itself.

- [ ] **Step 3: Commit**

```bash
cd /Users/cmante/Documents/root/clouddesk
git add lib/types.ts
git commit -m "feat: add CertId/CertProgress to types, restructure UserModel to per-cert"
```

---

## Task 3: Update `lib/userModel.ts`

**Files:**
- Modify: `lib/userModel.ts`

Rewrite to work with the per-cert `UserModel`. Add `initCertProgress`, `getCertProgress`, update `readUserModel` with stale-data guard, rewrite `updateUserModel` to write to cert slice, rewrite `pickWeakestDomain` to accept `CertProgress`.

- [ ] **Step 1: Replace the entire file**

```typescript
import { CERT_REGISTRY, type CertId } from "@/data/domains";
import type { UserModel, CertProgress, SessionResult, ScenarioOutput, DebriefOutput } from "./types";

const KEY = "clouddesk:userModel";

function initCertProgress(certId: CertId): CertProgress {
  const domains = CERT_REGISTRY[certId].domains as readonly { id: string }[];
  const domainScores = Object.fromEntries(domains.map((d) => [d.id, 50]));
  return { domainScores, sessions: [], seenCombinations: [] };
}

export function readUserModel(userId: string): UserModel {
  if (typeof window === "undefined") {
    return { userId, certs: {} };
  }
  const raw = sessionStorage.getItem(KEY);
  if (!raw) {
    return { userId, certs: {} };
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  // Stale-data guard: v1 model had domainScores at top level, not certs
  if (!parsed.certs || typeof parsed.certs !== "object") {
    return { userId, certs: {} };
  }
  return parsed as UserModel;
}

export function getCertProgress(userModel: UserModel, certId: CertId): CertProgress {
  return userModel.certs[certId] ?? initCertProgress(certId);
}

export function updateUserModel(
  userId: string,
  certId: CertId,
  result: { scenario: ScenarioOutput; debrief: DebriefOutput },
): void {
  if (typeof window === "undefined") return;
  const model = readUserModel(userId);
  const { scenario, debrief } = result;

  const certProgress = getCertProgress(model, certId);

  const session: SessionResult = {
    sessionId: `${userId}-${Date.now()}`,
    date: Date.now(),
    scenario,
    scores: debrief.scores,
    domainsExercised: debrief.examIntel.domainsExercised,
  };

  certProgress.sessions.push(session);

  // Rolling weighted average: new = old * 0.7 + session * 0.3
  for (const domainId of debrief.examIntel.domainsExercised) {
    if (domainId in certProgress.domainScores) {
      certProgress.domainScores[domainId] = Math.round(
        certProgress.domainScores[domainId] * 0.7 + debrief.scores.overall * 0.3,
      );
    }
  }

  const combo = `${scenario.industry}:${scenario.problemStatement.slice(0, 40)}`;
  if (!certProgress.seenCombinations.includes(combo)) {
    certProgress.seenCombinations.push(combo);
  }

  model.certs[certId] = certProgress;
  sessionStorage.setItem(KEY, JSON.stringify(model));
}

export function pickWeakestDomain(certProgress: CertProgress): string {
  const scores = certProgress.domainScores;
  return (Object.entries(scores) as [string, number][]).sort(
    (a, b) => a[1] - b[1],
  )[0][0];
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: errors in `lib/tools.ts`, `lib/llm.ts`, `agents/`, `prompts/`, `components/`, `app/`. No errors in `lib/userModel.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/cmante/Documents/root/clouddesk
git add lib/userModel.ts
git commit -m "feat: rewrite userModel for per-cert progress tracking with stale-data guard"
```

---

## Task 4: Update `lib/tools.ts` and `lib/llm.ts`

**Files:**
- Modify: `lib/tools.ts`
- Modify: `lib/llm.ts`

`buildScenarioTools` changes from `userModel: UserModel` to `certProgress: CertProgress`. The Azure service validator replaces the AWS one. `callLLMWithTools` third arg changes from `UserModel` to `CertProgress`.

- [ ] **Step 1: Replace `lib/tools.ts`**

```typescript
import { tool } from "ai";
import { z } from "zod";
import type { CertProgress } from "./types";

const AZURE_SERVICE_PATTERN =
  /\b(Azure\s+\w+|Microsoft\s+\w+|Entra\s+ID|Cosmos\s*DB|SQL\s+Database|Blob\s+Storage|Service\s+Bus|Event\s+Hub|Functions|App\s+Service|AKS|ACI|Key\s+Vault|Active\s+Directory|VNet|NSG|ExpressRoute|Front\s+Door|Application\s+Gateway|Log\s+Analytics|Sentinel)\b/i;

export function buildScenarioTools(certProgress: CertProgress) {
  return {
    readDomainScores: tool({
      description:
        "Read the user's current domain score for each cert domain. Call this first to identify the weakest domain to target.",
      inputSchema: z.object({}),
      execute: async () => certProgress.domainScores,
    }),

    listSeenCombinations: tool({
      description:
        "List industry:problem combinations the user has already seen. Use this to avoid generating a repeat scenario.",
      inputSchema: z.object({}),
      execute: async () => certProgress.seenCombinations,
    }),

    validateScenario: tool({
      description:
        "Validate a generated scenario before returning it. Checks that targetDomains includes the weakest domain and that problemStatement contains no Azure service names. Call this before producing your final JSON output.",
      inputSchema: z.object({
        targetDomains: z
          .array(z.string())
          .describe("The targetDomains array from your generated scenario"),
        problemStatement: z
          .string()
          .describe("The problemStatement from your generated scenario"),
        weakestDomain: z
          .string()
          .describe("The domain ID you identified as weakest from readDomainScores"),
      }),
      execute: async ({ targetDomains, problemStatement, weakestDomain }) => {
        if (!targetDomains.includes(weakestDomain)) {
          return {
            valid: false,
            reason: `targetDomains must include "${weakestDomain}" (the user's weakest domain). Found: [${targetDomains.join(", ")}]`,
          };
        }
        if (AZURE_SERVICE_PATTERN.test(problemStatement)) {
          const match = problemStatement.match(AZURE_SERVICE_PATTERN)?.[0];
          return {
            valid: false,
            reason: `problemStatement must describe a business problem only — no Azure service names. Found: "${match}". Rewrite without mentioning Azure services.`,
          };
        }
        return { valid: true, reason: "Scenario looks good." };
      },
    }),
  };
}
```

- [ ] **Step 2: Update `lib/llm.ts` — change third arg from UserModel to CertProgress**

Replace the entire file:

```typescript
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs } from "ai";
import type { Message, LLMOpts, CertProgress } from "./types";
import { buildScenarioTools } from "./tools";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const MODEL = google("gemini-2.5-flash");

function toAIMessages(messages: Message[]) {
  const msgs = messages.length > 0 ? messages : [{ role: "user" as const, content: "Begin." }];
  return msgs.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

// opts.json is intentional dead code — JSON output is enforced via prompt, not API flag
export async function callLLM(
  systemPrompt: string,
  messages: Message[],
  opts: LLMOpts = {},
): Promise<string> {
  const { text } = await generateText({
    model: MODEL,
    system: systemPrompt,
    messages: toAIMessages(messages),
    temperature: opts.temperature ?? 0.8,
  });
  return text;
}

export async function callLLMWithTools(
  systemPrompt: string,
  messages: Message[],
  certProgress: CertProgress,
  opts: LLMOpts = {},
): Promise<string> {
  const tools = buildScenarioTools(certProgress);
  const { text } = await generateText({
    model: MODEL,
    system: systemPrompt,
    messages: toAIMessages(messages),
    tools,
    stopWhen: stepCountIs(4),
    temperature: opts.temperature ?? 0.8,
  });
  return text;
}
```

- [ ] **Step 3: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: errors in `agents/`, `prompts/`, `components/`, `app/`. No errors in `lib/tools.ts` or `lib/llm.ts`.

- [ ] **Step 4: Commit**

```bash
cd /Users/cmante/Documents/root/clouddesk
git add lib/tools.ts lib/llm.ts
git commit -m "feat: tools and llm adapter accept CertProgress instead of UserModel, Azure service validator"
```

---

## Task 5: Update `prompts/scenarioAgent.ts`

**Files:**
- Modify: `prompts/scenarioAgent.ts`

Add `certId: CertId` as third parameter. Import `CERT_REGISTRY` from `@/data/domains`. Build domain list from `CERT_REGISTRY[certId].domains`. Update prompt header with cert name. Add `cert` field to JSON schema.

- [ ] **Step 1: Replace the entire file**

```typescript
import { CERT_REGISTRY, type CertId } from "@/data/domains";
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
  certId: CertId,
): string {
  const cert = CERT_REGISTRY[certId];
  const domainList = (cert.domains as readonly { id: string; name: string; keyServices: readonly string[]; concepts: readonly string[] }[])
    .map((d) => `- ${d.id}: ${d.name} (key services: ${d.keyServices.join(", ")}; concepts: ${d.concepts.join(", ")})`
    ).join("\n");

  return `You are a scenario generator for ${cert.name} (${certId.toUpperCase()}) exam prep.

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
- Never mention Azure services or technical solutions in problemStatement
- The curveball is a mid-conversation complication; keep it in character for the counterpart
- The industry and problem must NOT match any previously seen combination
- targetDomains must include the weakest domain and may include 1–2 others
- voiceId must be one of: af_sarah, af_bella, am_adam, am_michael
- counterpartRole in the JSON must exactly match: ${counterpartRole}
- cert in the JSON must exactly match: ${certId}
- clientName and clientTitle should be appropriate for the counterpart type:
  - client: business stakeholder name and title at a company
  - non-tech: a person with a non-technical title (e.g. "Writer", "Teacher", "Product Manager")
  - junior-dev: a junior developer name and title at a company
  - team-engineer: a senior/staff engineer name and title at a company

${certId.toUpperCase()} DOMAINS:
${domainList}

Return this exact JSON shape:
{
  "clientName": "string",
  "clientTitle": "string",
  "companyName": "string",
  "industry": "string",
  "problemStatement": "string (2-3 sentences from the counterpart's perspective — no Azure service names)",
  "constraint": "string (one constraint relevant to the counterpart type)",
  "targetDomains": ["string — domain IDs"],
  "curveball": "string (one sentence complication in character for the counterpart)",
  "difficulty": "beginner|intermediate|expert",
  "tip": "string (beginner only — one actionable hint) or omit the field entirely if not applicable",
  "voiceId": "af_sarah|af_bella|am_adam|am_michael",
  "counterpartRole": "${counterpartRole}",
  "cert": "${certId}"
}`;
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: errors in `agents/scenarioAgent.ts` (wrong arg count to `buildScenarioPrompt`) and downstream files. No errors in `prompts/scenarioAgent.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/cmante/Documents/root/clouddesk
git add prompts/scenarioAgent.ts
git commit -m "feat: scenario prompt accepts certId, injects Azure cert name and domains"
```

---

## Task 6: Update `prompts/debriefAgent.ts`

**Files:**
- Modify: `prompts/debriefAgent.ts`

Add `certId: CertId` to both functions. Replace `SAA_DOMAINS` import with `CERT_REGISTRY`. Update prompt headers and domain lists.

- [ ] **Step 1: Replace the entire file**

```typescript
import { CERT_REGISTRY, type CertId } from "@/data/domains";
import type { ScenarioOutput } from "@/lib/types";

export function buildExchangeAnalysisPrompt(scenario: ScenarioOutput, certId: CertId): string {
  const certName = CERT_REGISTRY[certId].name;
  return `You are a ${certName} exam coach reviewing a mock conversation transcript.

SCENARIO: ${scenario.clientName} (${scenario.clientTitle}) at ${scenario.companyName}
PROBLEM: ${scenario.problemStatement}
TARGET DOMAINS: ${scenario.targetDomains.join(", ")}

TASK: Score each user message independently. Do NOT synthesize or give overall scores yet.

For each exchange where the user spoke, output one entry. An "exchange" is one user message and the AI reply that preceded it.

Return ONLY a JSON array — no markdown, no commentary:
[
  {
    "exchangeIndex": number,
    "score": number (0-100, how well the user addressed the scenario domain in this message),
    "type": "good" | "incomplete" | "missed",
    "annotation": "string — what was strong, what was missing, and which ${certName} concept this tests"
  }
]

Scoring guide:
- good (70-100): Correct Azure approach, explained why, addressed the counterpart's concern
- incomplete (40-69): Correct direction but vague, missing justification, or only partially addressed
- missed (0-39): Wrong service, ignored the question, buzzword-heavy with no substance`;
}

export function buildDebriefPrompt(
  scenario: ScenarioOutput,
  exchangeAnalysis: string,
  certId: CertId,
): string {
  const cert = CERT_REGISTRY[certId];
  const domainList = (cert.domains as readonly { id: string; name: string; weight: number }[])
    .map((d) => `- ${d.id}: ${d.name} (exam weight ${Math.round(d.weight * 100)}%)`)
    .join("\n");

  return `You are a ${cert.name} exam coach producing a final debrief report.

SCENARIO CONTEXT:
- Client: ${scenario.clientName} (${scenario.clientTitle}) at ${scenario.companyName}
- Problem: ${scenario.problemStatement}
- Target domains: ${scenario.targetDomains.join(", ")}

${certId.toUpperCase()} DOMAINS:
${domainList}

EXCHANGE-LEVEL ANALYSIS (use this as your evidence — do not re-read the transcript independently):
${exchangeAnalysis}

TASK: Synthesize the exchange analysis into a final debrief. Derive scores from the evidence above.

Return ONLY valid JSON — no markdown, no commentary:
{
  "scores": {
    "technicalAccuracy": number (0-100, weighted average of exchange scores where Azure correctness was tested),
    "depthOfExplanation": number (0-100, did the user explain WHY, not just WHAT),
    "domainCoverage": number (0-100, how well the target domains were addressed across all exchanges),
    "communicationClarity": number (0-100, was the explanation clear to the counterpart),
    "overall": number (0-100, weighted mean of the four scores above)
  },
  "moments": [
    {
      "exchangeIndex": number,
      "type": "good|incomplete|missed",
      "userMessage": "exact quote from transcript",
      "annotation": "what was good/missing and why",
      "certRelevance": "which ${cert.name} concept this tests (optional)"
    }
  ],
  "examIntel": {
    "domainsExercised": ["domain IDs from the ${certId.toUpperCase()} domain list above"],
    "examQuestionExample": "A company needs... Which solution? (A)...(B)...(C)...(D)...",
    "keyConceptsTested": ["string"]
  },
  "studyNext": {
    "weakAreas": ["string — cite specific exchange indices as evidence, e.g. 'RBAC least-privilege (exchanges 3, 7 were incomplete)'"],
    "suggestedTopics": ["string"],
    "suggestedNextScenario": "one sentence describing ideal next scenario based on weak areas"
  }
}`;
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: errors in `agents/debriefAgent.ts` (wrong arg count) and components. No errors in `prompts/debriefAgent.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/cmante/Documents/root/clouddesk
git add prompts/debriefAgent.ts
git commit -m "feat: debrief prompts accept certId, inject Azure cert name and domain weights"
```

---

## Task 7: Update `agents/scenarioAgent.ts` and `agents/debriefAgent.ts`

**Files:**
- Modify: `agents/scenarioAgent.ts`
- Modify: `agents/debriefAgent.ts`

Wire the new cert plumbing through both agents.

- [ ] **Step 1: Replace `agents/scenarioAgent.ts`**

```typescript
import { callLLMWithTools } from "@/lib/llm";
import { buildScenarioPrompt } from "@/prompts/scenarioAgent";
import { getCertProgress } from "@/lib/userModel";
import type { ScenarioOutput, SessionConfig, UserModel } from "@/lib/types";

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function scenarioAgent(
  config: SessionConfig,
  userModel: UserModel,
): Promise<ScenarioOutput> {
  const certProgress = getCertProgress(userModel, config.cert);
  const systemPrompt = buildScenarioPrompt(config.role, config.counterpartRole, config.cert);

  const raw = await callLLMWithTools(
    systemPrompt,
    [{
      role: "user",
      content: `Generate a ${config.difficulty} scenario for a ${config.role} talking to a ${config.counterpartRole}.`,
    }],
    certProgress,
    { temperature: 0.9 },
  );

  try {
    return JSON.parse(stripFences(raw)) as ScenarioOutput;
  } catch {
    throw new Error(`scenarioAgent: failed to parse LLM response as JSON. Raw: ${raw.slice(0, 500)}`);
  }
}
```

- [ ] **Step 2: Replace `agents/debriefAgent.ts`**

```typescript
import { callLLM } from "@/lib/llm";
import { buildExchangeAnalysisPrompt, buildDebriefPrompt } from "@/prompts/debriefAgent";
import { updateUserModel } from "@/lib/userModel";
import type { DebriefOutput, Message, ScenarioOutput } from "@/lib/types";

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

type ExchangeAnalysis = {
  exchangeIndex: number;
  score: number;
  type: "good" | "incomplete" | "missed";
  annotation: string;
};

export async function debriefAgent(
  transcript: Message[],
  scenario: ScenarioOutput,
): Promise<DebriefOutput> {
  const transcriptText = transcript
    .map((m) => `${m.role === "user" ? "Candidate" : scenario.clientName}: ${m.content}`)
    .join("\n\n");

  // Step 1: score each exchange independently
  const analysisRaw = await callLLM(
    buildExchangeAnalysisPrompt(scenario, scenario.cert),
    [{ role: "user", content: `Transcript:\n\n${transcriptText}` }],
    { json: true, temperature: 0.1 },
  );

  let exchangeAnalysis: ExchangeAnalysis[];
  try {
    exchangeAnalysis = JSON.parse(stripFences(analysisRaw)) as ExchangeAnalysis[];
  } catch {
    throw new Error(`debriefAgent step 1: failed to parse exchange analysis. Raw: ${analysisRaw.slice(0, 500)}`);
  }

  const analysisText = JSON.stringify(exchangeAnalysis, null, 2);

  // Step 2: synthesize final debrief from exchange evidence
  const debriefRaw = await callLLM(
    buildDebriefPrompt(scenario, analysisText, scenario.cert),
    [{ role: "user", content: `Transcript:\n\n${transcriptText}` }],
    { json: true, temperature: 0.2 },
  );

  let debrief: DebriefOutput;
  try {
    debrief = JSON.parse(stripFences(debriefRaw)) as DebriefOutput;
  } catch {
    throw new Error(`debriefAgent step 2: failed to parse debrief. Raw: ${debriefRaw.slice(0, 500)}`);
  }

  updateUserModel(scenario.clientName, scenario.cert, { scenario, debrief });
  return debrief;
}
```

Note: `updateUserModel` first arg is `userId`. The debrief agent doesn't have `userId` in its current signature — it uses `scenario.clientName` as a placeholder. This was a pre-existing issue in the codebase (the original `debriefAgent` also used a placeholder). The userId is available in the API route; fixing this properly would require passing it through, but that is out of scope for this task. Leave as-is.

- [ ] **Step 3: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: errors in components and `app/page.tsx` only. No errors in `agents/`.

- [ ] **Step 4: Commit**

```bash
cd /Users/cmante/Documents/root/clouddesk
git add agents/scenarioAgent.ts agents/debriefAgent.ts
git commit -m "feat: agents resolve certProgress from userModel, pass certId through to prompts"
```

---

## Task 8: Update components — BriefCard, ExamIntel, DomainBars

**Files:**
- Modify: `components/Brief/BriefCard.tsx`
- Modify: `components/Debrief/ExamIntel.tsx`
- Modify: `components/Dashboard/DomainBars.tsx`

Replace `SAA_DOMAINS` imports with `CERT_REGISTRY` lookups. `DomainBars` gains `certId` and `domainScores` props (dropping the old `DomainScores` type).

- [ ] **Step 1: Replace `components/Brief/BriefCard.tsx`**

```typescript
// components/Brief/BriefCard.tsx
import { Card, CardContent } from "@/components/ui/card";
import { CERT_REGISTRY, getDomainName } from "@/data/domains";
import type { ScenarioOutput } from "@/lib/types";

interface Props {
  scenario: ScenarioOutput;
}

export function BriefCard({ scenario }: Props) {
  return (
    <Card className="bg-zinc-900 border-zinc-800 w-full max-w-xl">
      <CardContent className="pt-6 space-y-5">
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

        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Situation</p>
          <p className="text-zinc-300 leading-relaxed">{scenario.problemStatement}</p>
        </div>

        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Constraint</p>
          <p className="text-zinc-400">{scenario.constraint}</p>
        </div>

        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Cert</p>
          <p className="text-zinc-400 text-sm">{CERT_REGISTRY[scenario.cert].name}</p>
        </div>

        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Domains tested</p>
          <div className="flex flex-wrap gap-2">
            {scenario.targetDomains.map((id) => (
              <span
                key={id}
                className="text-xs border rounded-full px-3 py-1 bg-zinc-700 text-zinc-300 border-zinc-600"
              >
                {getDomainName(scenario.cert, id)}
              </span>
            ))}
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

- [ ] **Step 2: Replace `components/Debrief/ExamIntel.tsx`**

```typescript
// components/Debrief/ExamIntel.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDomainName } from "@/data/domains";
import type { CertId } from "@/data/domains";
import type { DebriefOutput } from "@/lib/types";

interface Props {
  examIntel: DebriefOutput["examIntel"];
  certId: CertId;
}

export function ExamIntel({ examIntel, certId }: Props) {
  return (
    <Card className="bg-zinc-900 border-zinc-800 w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-white text-base">Exam Intelligence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Domains exercised</p>
          <div className="flex flex-wrap gap-2">
            {examIntel.domainsExercised.map((id) => (
              <span key={id} className="text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-full px-3 py-1">
                {getDomainName(certId, id)}
              </span>
            ))}
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

- [ ] **Step 3: Replace `components/Dashboard/DomainBars.tsx`**

```typescript
// components/Dashboard/DomainBars.tsx
"use client";
import { CERT_REGISTRY, type CertId } from "@/data/domains";

interface Props {
  certId: CertId;
  domainScores: Record<string, number>;
}

export function DomainBars({ certId, domainScores }: Props) {
  const domains = CERT_REGISTRY[certId].domains as readonly { id: string; name: string }[];

  const entries = domains.map((d) => ({
    id: d.id,
    name: d.name,
    score: domainScores[d.id] ?? 50,
  }));

  const weakest = entries.reduce((a, b) => (a.score < b.score ? a : b));

  return (
    <div className="space-y-4">
      <div className="bg-blue-500/20 border-l-4 border-l-blue-500 border border-blue-500/40 rounded-md px-4 py-3">
        <p className="text-xs text-blue-400 uppercase tracking-wider font-medium mb-1">Adaptive targeting</p>
        <p className="text-blue-200 text-base font-semibold">{weakest.name}</p>
        <p className="text-blue-300 text-sm mt-0.5">
          Score: {weakest.score}% — your next session will focus here
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
              className="h-full rounded-full transition-all duration-700 bg-blue-500"
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Check TypeScript compiles**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: errors only in `app/page.tsx`, `app/dashboard/page.tsx`, and debrief page (caller sites for the updated components). No errors in the three component files.

- [ ] **Step 5: Commit**

```bash
cd /Users/cmante/Documents/root/clouddesk
git add components/Brief/BriefCard.tsx components/Debrief/ExamIntel.tsx components/Dashboard/DomainBars.tsx
git commit -m "feat: components use CERT_REGISTRY for domain lookups, DomainBars accepts certId prop"
```

---

## Task 9: Update `app/page.tsx` and `app/dashboard/page.tsx`

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/dashboard/page.tsx`

Setup page: add cert picker, update userModel initialization and stale-data guard. Dashboard: pass `certId` and correct `domainScores` to `DomainBars`, use `sessions` from cert slice.

- [ ] **Step 1: Replace `app/page.tsx`**

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CERT_REGISTRY, type CertId } from "@/data/domains";
import type { SessionConfig, UserModel } from "@/lib/types";

const CERTS: { value: CertId; label: string; desc: string }[] = [
  { value: "az-104", label: "AZ-104", desc: "Azure Administrator" },
  { value: "az-204", label: "AZ-204", desc: "Azure Developer" },
  { value: "az-500", label: "AZ-500", desc: "Azure Security Engineer" },
  { value: "az-700", label: "AZ-700", desc: "Azure Network Engineer" },
  { value: "dp-300", label: "DP-300", desc: "Azure Database Administrator" },
];

const ROLES: { value: SessionConfig["role"]; label: string; desc: string }[] = [
  { value: "solutions-architect", label: "Solutions Architect", desc: "End-to-end cloud system design" },
  { value: "senior-developer", label: "Senior Developer", desc: "Implementation depth, APIs, and debugging" },
  { value: "team-lead", label: "Team Lead", desc: "Architectural decisions and technical communication" },
];

const DIFFICULTY_COUNTERPART: Record<SessionConfig["difficulty"], SessionConfig["counterpartRole"]> = {
  beginner: "non-tech",
  intermediate: "client",
  expert: "team-engineer",
};

const DIFFICULTIES: { value: SessionConfig["difficulty"]; label: string; desc: string }[] = [
  { value: "beginner", label: "Beginner", desc: "Tips enabled — explaining to a non-technical person" },
  { value: "intermediate", label: "Intermediate", desc: "No tips — a business client pushing on outcomes" },
  { value: "expert", label: "Expert", desc: "No tips — a senior engineer challenging your decisions" },
];

export default function SetupPage() {
  const router = useRouter();
  const [cert, setCert] = useState<CertId>("az-104");
  const [role, setRole] = useState<SessionConfig["role"]>("solutions-architect");
  const [difficulty, setDifficulty] = useState<SessionConfig["difficulty"]>("intermediate");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSession() {
    setLoading(true);
    setError(null);
    const userId = sessionStorage.getItem("clouddesk:userId") ?? `user-${Date.now()}`;
    const config: SessionConfig = {
      userId,
      cert,
      role,
      counterpartRole: DIFFICULTY_COUNTERPART[difficulty],
      difficulty,
    };

    sessionStorage.setItem("clouddesk:config", JSON.stringify(config));
    sessionStorage.setItem("clouddesk:userId", userId);

    // Stale-data guard: v1 model had domainScores at top level, not certs
    const rawModel = sessionStorage.getItem("clouddesk:userModel");
    let userModel: UserModel;
    if (rawModel) {
      const parsed = JSON.parse(rawModel) as Record<string, unknown>;
      userModel = parsed.certs && typeof parsed.certs === "object"
        ? (parsed as UserModel)
        : { userId, certs: {} };
    } else {
      userModel = { userId, certs: {} };
    }

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
        <div className="flex gap-2 flex-wrap">
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
      <Card className="w-full max-w-lg bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-2xl text-white">CloudDesk</CardTitle>
          <CardDescription className="text-zinc-400">
            Azure certification prep — simulated conversations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SelectorGroup
            label="Certification"
            options={CERTS}
            value={cert}
            onChange={setCert}
          />
          <SelectorGroup
            label="Your role"
            options={ROLES}
            value={role}
            onChange={setRole}
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

- [ ] **Step 2: Replace `app/dashboard/page.tsx`**

```typescript
// app/dashboard/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DomainBars } from "@/components/Dashboard/DomainBars";
import { SessionList } from "@/components/Dashboard/SessionList";
import { readUserModel, getCertProgress } from "@/lib/userModel";
import { CERT_REGISTRY, type CertId } from "@/data/domains";
import type { UserModel, CertProgress } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [model, setModel] = useState<UserModel | null>(null);
  const [certId, setCertId] = useState<CertId>("az-104");
  const [certProgress, setCertProgress] = useState<CertProgress | null>(null);

  useEffect(() => {
    const userId = sessionStorage.getItem("clouddesk:userId") ?? "user";
    const m = readUserModel(userId);
    setModel(m);

    // Use the cert from the last session config, falling back to az-104
    const rawConfig = sessionStorage.getItem("clouddesk:config");
    const lastCert: CertId = rawConfig
      ? ((JSON.parse(rawConfig) as { cert?: CertId }).cert ?? "az-104")
      : "az-104";
    setCertId(lastCert);
    setCertProgress(getCertProgress(m, lastCert));
  }, []);

  if (!model || !certProgress) {
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
          <div>
            <h1 className="text-2xl font-bold text-white">Your Progress</h1>
            <p className="text-zinc-500 text-sm mt-1">{CERT_REGISTRY[certId].name}</p>
          </div>
          <Button
            onClick={() => router.push("/")}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            New Session
          </Button>
        </div>

        <section>
          <h2 className="text-zinc-400 text-xs uppercase tracking-wider mb-4">Domain Scores</h2>
          <DomainBars certId={certId} domainScores={certProgress.domainScores} />
        </section>

        <section>
          <h2 className="text-zinc-400 text-xs uppercase tracking-wider mb-4">
            Sessions ({certProgress.sessions.length})
          </h2>
          <SessionList sessions={certProgress.sessions} />
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Check TypeScript compiles with zero errors**

```bash
cd /Users/cmante/Documents/root/clouddesk
npx tsc --noEmit 2>&1
```

Expected: **zero errors**.

- [ ] **Step 4: Commit**

```bash
cd /Users/cmante/Documents/root/clouddesk
git add app/page.tsx app/dashboard/page.tsx
git commit -m "feat: setup page adds cert picker, dashboard reads per-cert progress"
```

---

## Task 10: Delete `data/domains/aws-saa-c03.ts` and final build check

**Files:**
- Delete: `data/domains/aws-saa-c03.ts`

- [ ] **Step 1: Confirm no remaining imports of aws-saa-c03**

```bash
cd /Users/cmante/Documents/root/clouddesk
grep -r "aws-saa-c03" --include="*.ts" --include="*.tsx" .
```

Expected: zero results. If any files still import it, fix them before deleting.

- [ ] **Step 2: Delete the file**

```bash
cd /Users/cmante/Documents/root/clouddesk
rm data/domains/aws-saa-c03.ts
```

- [ ] **Step 3: Run full build**

```bash
cd /Users/cmante/Documents/root/clouddesk
npm run build 2>&1 | tail -30
```

Expected: clean build with zero errors.

- [ ] **Step 4: Check the debrief page passes certId to ExamIntel**

Read `app/debrief/page.tsx` and find where `ExamIntel` is rendered. It now requires a `certId` prop. If the prop is missing, add it:

```typescript
// ExamIntel now requires certId — read it from the stored scenario
const scenario = JSON.parse(sessionStorage.getItem("clouddesk:scenario") ?? "{}");
// Then pass:
<ExamIntel examIntel={debrief.examIntel} certId={scenario.cert ?? "az-104"} />
```

If `app/debrief/page.tsx` already reads scenario from sessionStorage, just add the `certId` prop to the `ExamIntel` component call. Read the file first to see the exact existing code.

- [ ] **Step 5: Re-run build to confirm clean**

```bash
cd /Users/cmante/Documents/root/clouddesk
npm run build 2>&1 | tail -20
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/cmante/Documents/root/clouddesk
git add -A
git commit -m "feat: delete aws-saa-c03.ts, wire certId to ExamIntel, clean build"
```
