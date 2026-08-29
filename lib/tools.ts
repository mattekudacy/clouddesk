import { tool } from "ai";
import { z } from "zod";
import type { ScenarioContext } from "./types";
import { CERT_REGISTRY, type CertId } from "@/data/domains";
import { pickWeakestDomain } from "./domainPriority";

const AZURE_SERVICE_PATTERN =
  /\b(Azure\s+\w+|Microsoft\s+\w+|Entra\s+ID|Cosmos\s*DB|SQL\s+Database|Blob\s+Storage|Service\s+Bus|Event\s+Hub|Functions|App\s+Service|AKS|ACI|Key\s+Vault|Active\s+Directory|VNet|NSG|ExpressRoute|Front\s+Door|Application\s+Gateway|Log\s+Analytics|Sentinel)\b/i;

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
