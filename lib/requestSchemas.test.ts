import { describe, it, expect } from "vitest";
import { ScenarioOutputRequestSchema } from "./requestSchemas";

function makeScenario(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    clientName: "Priya Shah",
    clientTitle: "Operations Director",
    companyName: "Northwind Traders",
    industry: "Logistics",
    problemStatement: "text",
    constraint: "text",
    targetDomains: ["identities"],
    curveball: "text",
    voiceId: "af_sarah",
    difficulty: "beginner",
    counterpartRole: "non-tech",
    cert: "az-104",
    ...overrides,
  };
}

describe("ScenarioOutputRequestSchema", () => {
  it("accepts targetDomains that are real domains for the given cert", () => {
    const result = ScenarioOutputRequestSchema.safeParse(makeScenario());
    expect(result.success).toBe(true);
  });

  // A client replaying a scenario back to /api/debrief or /api/meeting
  // controls this payload entirely (these routes are public/
  // unauthenticated — see the file header). Without this check, a
  // fabricated domainId here would flow straight into
  // makeExchangeAnalysisEntrySchema's domainId enum in
  // agents/debriefAgent.ts. See CLAUDE.md, "The Feedback Loop".
  it("rejects a targetDomains entry that isn't a real domain for the given cert", () => {
    const result = ScenarioOutputRequestSchema.safeParse(
      makeScenario({ targetDomains: ["totally-made-up-domain"] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a domain that's real for a different cert but not this one", () => {
    // "identities" belongs to az-104, not az-500's domain list.
    const result = ScenarioOutputRequestSchema.safeParse(
      makeScenario({ targetDomains: ["identities"], cert: "az-500" }),
    );
    expect(result.success).toBe(false);
  });
});
