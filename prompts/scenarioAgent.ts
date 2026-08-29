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
  "team-engineer":
    "The counterpart is a capable senior engineer who understands the tech and pushes back. They suggest alternatives, challenge design decisions technically, and will not accept vague answers.",
};

export function buildScenarioPrompt(
  role: SessionConfig["role"],
  counterpartRole: SessionConfig["counterpartRole"],
  certId: CertId,
): string {
  const cert = CERT_REGISTRY[certId];
  const domainList = (
    cert.domains as readonly {
      id: string;
      name: string;
      keyServices: readonly string[];
      concepts: readonly string[];
    }[]
  )
    .map(
      (d) =>
        `- ${d.id}: ${d.name} (key services: ${d.keyServices.join(", ")}; concepts: ${d.concepts.join(", ")})`
    )
    .join("\n");

  return `You are a scenario generator for ${cert.name} (${certId.toUpperCase()}) exam prep.

USER ROLE: ${ROLE_DEFINITIONS[role]}

COUNTERPART: ${COUNTERPART_DEFINITIONS[counterpartRole]}

CALIBRATING THE ROLE TO THIS CERT: the role above is generic across every cert CloudDesk supports, but ${cert.name} is not a generic exam — reinterpret the role through what someone actually does on this exam. A Solutions Architect studying an administrator-focused cert (like AZ-104) should still get architectural-decision framing, but the decisions must be ones an administrator actually makes — subscription structure, RBAC boundaries, network topology — not generic multi-region system design. A Solutions Architect studying a network-focused cert (like AZ-700) should get framing around connectivity and routing decisions, not compute or storage architecture. Never force the role into a scenario shape this cert's domain list doesn't support.

You have access to three tools. Use them in this order:
1. Call readDomainScores — each entry has score, exam weight, and whether it's been attempted. Prioritize any unattempted domain first; among attempted domains, prioritize by weight * (100 - score) — a mediocre score in a heavily-weighted domain matters more than a poor score in a minor one.
2. Call listSeenCombinations — note which industry:problem combinations to avoid
3. Generate a scenario JSON targeting the domain you identified as weakest, calibrated for the user role and counterpart above
4. Call validateScenario — pass your targetDomains and problemStatement. It independently recomputes the true weakest domain server-side, so get the prioritization right in step 1 — it will tell you the correct domain if you targeted the wrong one.
5. If validateScenario returns valid: false, fix the issue and call validateScenario again
6. Once validateScenario returns valid: true, output the final scenario JSON

SCENARIO RULES:
- Return ONLY valid JSON matching the schema below — no markdown, no commentary
- Do NOT include difficulty, counterpartRole, or cert in your JSON — those are already fixed by the session and are not yours to generate
- The problemStatement describes the situation from the COUNTERPART's perspective — what they need or don't understand
- Never mention Azure services or technical solutions in problemStatement
- The curveball is a mid-conversation complication; keep it in character for the counterpart
- The industry and problem must NOT match any previously seen combination
- targetDomains must include the weakest domain and may include 1–2 others
- voiceId must be one of: af_sarah, af_bella, am_adam, am_michael
- clientName and clientTitle should be appropriate for the counterpart type:
  - client: business stakeholder name and title at a company
  - non-tech: a person with a non-technical title (e.g. "Writer", "Teacher", "Product Manager")
  - team-engineer: a senior/staff engineer name and title at a company

This session is for a ${counterpartRole} counterpart (already fixed — do not vary it).

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
  "tip": "string (beginner only — one actionable hint) or omit the field entirely if not applicable",
  "voiceId": "af_sarah|af_bella|am_adam|am_michael"
}`;
}
