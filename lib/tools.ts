import { tool } from "ai";
import { z } from "zod";
import type { ScenarioContext } from "./types";
import { CERT_REGISTRY, type CertId } from "@/data/domains";
import { pickWeakestDomain } from "./domainPriority";

// problemStatement is written from a non-technical counterpart's
// perspective (see buildScenarioPrompt) — plain English, not a service
// name. Some product names (Functions, Front Door, Sentinel, App Service,
// Application Gateway) are also ordinary English words/phrases a
// non-technical person would plausibly use unprompted ("too many functions
// to track", "the front door needs a new badge system", "a Sentinel
// Insurance subsidiary"), so those only count as a violation when they
// appear after an "Azure"/"Microsoft" prefix — caught by the first two
// alternatives below, which match up to two words after the vendor name.
// Everything else here (Cosmos DB, VNet, ExpressRoute, ...) isn't a
// plausible thing for anyone to say by coincidence, so it's safe to match
// bare.
const AZURE_SERVICE_PATTERN =
  /\b(Azure\s+\w+(?:\s+\w+)?|Microsoft\s+\w+(?:\s+\w+)?|Entra\s+ID|Cosmos\s*DB|SQL\s+Database|Blob\s+Storage|Service\s+Bus|Event\s+Hub|AKS|ACI|Key\s+Vault|Active\s+Directory|VNet|NSG|ExpressRoute|Log\s+Analytics)\b/i;

// Takes the projection (see ScenarioContext), not the full user model —
// session history never reaches here. See CLAUDE.md, Agent Contracts.
export function buildScenarioTools(context: ScenarioContext, certId: CertId) {
  const domains = CERT_REGISTRY[certId].domains as readonly { id: string; weight: number }[];
  const attempted = new Set(context.attemptedDomainIds);

  return {
    readDomainScores: tool({
      description:
        "Read the user's current score, exam weight, and attempted status for each cert domain. Call this first — prioritize any unattempted domain, then among attempted domains prioritize by weight * (100 - score): a mediocre score in a heavily-weighted domain matters more than a poor score in a minor one.",
      inputSchema: z.object({}),
      execute: async () =>
        domains.map((d) => ({
          id: d.id,
          score: context.domainScores[d.id] ?? 50,
          weight: d.weight,
          attempted: attempted.has(d.id),
        })),
    }),

    listSeenCombinations: tool({
      description:
        "List industry:problem combinations the user has already seen. Use this to avoid generating a repeat scenario.",
      inputSchema: z.object({}),
      execute: async () => context.seenCombinations,
    }),

    validateScenario: tool({
      description:
        "Validate a generated scenario before returning it. Independently recomputes the true weight-adjusted weakest domain from server-side data and checks targetDomains against it — your own domain prioritization is not trusted, so get it right in readDomainScores first. Also checks that problemStatement contains no Azure service names. Call this before producing your final JSON output.",
      inputSchema: z.object({
        targetDomains: z
          .array(z.string())
          .describe("The targetDomains array from your generated scenario"),
        problemStatement: z
          .string()
          .describe("The problemStatement from your generated scenario"),
      }),
      execute: async ({ targetDomains, problemStatement }) => {
        const trueWeakest = pickWeakestDomain(context.domainScores, domains, attempted);
        if (!targetDomains.includes(trueWeakest)) {
          return {
            valid: false,
            reason: `targetDomains must include "${trueWeakest}" — that is the actual weakest domain once exam weight and unattempted status are factored in, not just whichever has the lowest raw score. Found: [${targetDomains.join(", ")}]`,
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
