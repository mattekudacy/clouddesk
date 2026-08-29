import { describe, it, expect } from "vitest";
import { buildScenarioTools } from "./tools";
import type { ScenarioContext } from "./types";

// buildScenarioTools wires the Scenario Agent's server-side guards
// (CLAUDE.md: "the model's own claim about which domain is weakest is
// never trusted"). This was previously the least-tested part of that
// story — lib/domainPriority.ts (the algorithm) has full coverage, but the
// tool wrapper that actually calls it, and the service-name regex, had
// none.
// All five az-104 domains attempted, with storage as the clear
// weighted-gap weakest (weight 0.15 * (100-40) = 9, vs. identities' 0.20 *
// (100-90) = 2 and everything else near-perfect) — otherwise
// pickWeakestDomain's "any unattempted domain outranks every attempted
// one" rule would just pick an unattempted domain regardless of score,
// which isn't what these tests are exercising.
function makeContext(overrides: Partial<ScenarioContext> = {}): ScenarioContext {
  return {
    domainScores: { identities: 90, storage: 40, compute: 95, networking: 95, monitoring: 95 },
    seenCombinations: [],
    attemptedDomainIds: ["identities", "storage", "compute", "networking", "monitoring"],
    ...overrides,
  };
}

describe("buildScenarioTools", () => {
  describe("readDomainScores", () => {
    it("reports score, weight, and attempted status for every cert domain", async () => {
      const context = makeContext({
        domainScores: { identities: 90 },
        attemptedDomainIds: ["identities"],
      });
      const tools = buildScenarioTools(context, "az-104");
      const result = (await tools.readDomainScores.execute!({}, {} as never)) as {
        id: string;
        score: number;
        weight: number;
        attempted: boolean;
      }[];
      expect(result.length).toBe(5); // every az-104 domain, not just the scored one

      const identities = result.find((d) => d.id === "identities")!;
      expect(identities.score).toBe(90);
      expect(identities.attempted).toBe(true);

      const networking = result.find((d) => d.id === "networking")!;
      expect(networking.attempted).toBe(false);
      expect(networking.score).toBe(50); // unscored domain defaults to 50
    });
  });

  describe("listSeenCombinations", () => {
    it("passes seenCombinations through unchanged", async () => {
      const tools = buildScenarioTools(makeContext({ seenCombinations: ["Logistics:foo"] }), "az-104");
      const result = await tools.listSeenCombinations.execute!({}, {} as never);
      expect(result).toEqual(["Logistics:foo"]);
    });
  });

  describe("validateScenario", () => {
    it("rejects targetDomains that omit the true weakest domain", async () => {
      // identities=90, storage=40 among two attempted domains — storage is
      // weaker even before weighting. compute() must not just trust the
      // model's own targetDomains claim.
      const tools = buildScenarioTools(makeContext(), "az-104");
      const result = (await tools.validateScenario.execute!(
        { targetDomains: ["identities"], problemStatement: "Our warehouse loses track of inventory." },
        {} as never,
      )) as { valid: boolean; reason: string };
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("storage");
    });

    it("accepts targetDomains that include the true weakest domain", async () => {
      const tools = buildScenarioTools(makeContext(), "az-104");
      const result = (await tools.validateScenario.execute!(
        { targetDomains: ["storage"], problemStatement: "Our warehouse loses track of inventory." },
        {} as never,
      )) as { valid: boolean };
      expect(result.valid).toBe(true);
    });

    it("prioritizes any unattempted domain over every attempted one, regardless of score", async () => {
      const context = makeContext({ attemptedDomainIds: ["identities", "storage"] }); // compute, networking, monitoring unattempted
      const tools = buildScenarioTools(context, "az-104");
      const result = (await tools.validateScenario.execute!(
        { targetDomains: ["identities"], problemStatement: "text" },
        {} as never,
      )) as { valid: boolean; reason: string };
      expect(result.valid).toBe(false);
      // one of the unattempted domains, not identities/storage
      expect(["compute", "networking", "monitoring"].some((id) => result.reason.includes(id))).toBe(true);
    });

    it("rejects a problemStatement containing an Azure-prefixed service name", async () => {
      const tools = buildScenarioTools(makeContext(), "az-104");
      const result = (await tools.validateScenario.execute!(
        { targetDomains: ["storage"], problemStatement: "We just deployed Azure Functions and it broke everything." },
        {} as never,
      )) as { valid: boolean; reason: string };
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Azure");
    });

    it("rejects a problemStatement containing a bare, unambiguous service name", async () => {
      const tools = buildScenarioTools(makeContext(), "az-104");
      const result = (await tools.validateScenario.execute!(
        { targetDomains: ["storage"], problemStatement: "Our Cosmos DB cluster is too expensive to run." },
        {} as never,
      )) as { valid: boolean };
      expect(result.valid).toBe(false);
    });

    // Regression coverage for the false-positive fix: these are plain
    // English phrases a non-technical counterpart would plausibly use —
    // none of them name an actual Azure service without a vendor prefix.
    it.each([
      "Our team handles too many functions manually and nobody knows who owns what.",
      "The front door of our office needs a new badge system.",
      "We are a Sentinel Insurance subsidiary and reporting is a mess.",
      "Our booking app service keeps crashing during peak hours.",
      "The application gateway to our building needs a security review.",
    ])("does not flag plain English that merely contains an ambiguous product word: %s", async (problemStatement) => {
      const tools = buildScenarioTools(makeContext(), "az-104");
      const result = (await tools.validateScenario.execute!(
        { targetDomains: ["storage"], problemStatement },
        {} as never,
      )) as { valid: boolean; reason: string };
      expect(result.valid, result.reason).toBe(true);
    });

    it("accepts a well-formed scenario with no service names and the correct target domain", async () => {
      const tools = buildScenarioTools(makeContext(), "az-104");
      const result = (await tools.validateScenario.execute!(
        { targetDomains: ["storage"], problemStatement: "Our warehouse loses track of inventory during peak season." },
        {} as never,
      )) as { valid: boolean };
      expect(result.valid).toBe(true);
    });
  });
});
