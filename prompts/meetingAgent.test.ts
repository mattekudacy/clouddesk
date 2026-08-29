import { describe, it, expect } from "vitest";
import { buildMeetingPrompt, closingLine, MAX_EXCHANGES } from "./meetingAgent";
import type { ScenarioOutput } from "@/lib/types";

function makeScenario(overrides: Partial<ScenarioOutput> = {}): ScenarioOutput {
  return {
    clientName: "Priya Shah",
    clientTitle: "Operations Director",
    companyName: "Northwind Traders",
    industry: "Logistics",
    problemStatement: "Our warehouse keeps losing track of inventory during peak season.",
    constraint: "Must not require new hires to run it.",
    targetDomains: ["identities"],
    curveball: "A regional office suddenly needs read-only access.",
    voiceId: "af_sarah",
    difficulty: "intermediate",
    counterpartRole: "client",
    cert: "az-104",
    ...overrides,
  };
}

describe("buildMeetingPrompt — curveball timing", () => {
  it("injects the curveball on exactly one exchange within 5-8, not on every turn in the range", () => {
    const scenario = makeScenario();
    const injections = Array.from({ length: 12 }, (_, exchangeCount) =>
      buildMeetingPrompt(scenario, exchangeCount).includes("CURVEBALL TO INJECT THIS TURN"),
    );
    const injectedTurns = injections.map((hit, i) => (hit ? i : null)).filter((i) => i !== null);

    expect(injectedTurns.length).toBe(1);
    expect(injectedTurns[0]).toBeGreaterThanOrEqual(5);
    expect(injectedTurns[0]).toBeLessThanOrEqual(8);
  });

  it("is deterministic for the same scenario — replaying a greeting doesn't move the curveball", () => {
    const scenario = makeScenario();
    const findTurn = () =>
      Array.from({ length: 9 }, (_, i) => i).find((i) =>
        buildMeetingPrompt(scenario, i).includes("CURVEBALL TO INJECT THIS TURN"),
      );
    expect(findTurn()).toBe(findTurn());
  });

  it("varies across different scenarios rather than always landing on the same exchange", () => {
    const findTurn = (curveball: string) =>
      Array.from({ length: 9 }, (_, i) => i).find((i) =>
        buildMeetingPrompt(makeScenario({ curveball }), i).includes("CURVEBALL TO INJECT THIS TURN"),
      );
    const turns = new Set(
      ["A regional office needs access.", "The budget just got cut in half.", "A competitor just undercut them.", "Leadership wants this by Friday."].map(
        findTurn,
      ),
    );
    // Not asserting a specific distribution, just that it isn't hardcoded to
    // a single exchange regardless of scenario content.
    expect(turns.size).toBeGreaterThan(1);
  });
});

describe("buildMeetingPrompt — wrap-up pacing", () => {
  it("includes no pacing instruction well before the wrap-up window", () => {
    const prompt = buildMeetingPrompt(makeScenario(), 3);
    expect(prompt).not.toContain("approaching its natural end");
    expect(prompt).not.toContain("THIS IS YOUR FINAL MESSAGE");
  });

  it("nudges toward a close starting at exchange 10", () => {
    const prompt = buildMeetingPrompt(makeScenario(), MAX_EXCHANGES - 5);
    expect(prompt).toContain("approaching its natural end");
    expect(prompt).not.toContain("THIS IS YOUR FINAL MESSAGE");
  });

  it("forces a final turn at MAX_EXCHANGES - 1", () => {
    const prompt = buildMeetingPrompt(makeScenario(), MAX_EXCHANGES - 1);
    expect(prompt).toContain("THIS IS YOUR FINAL MESSAGE");
  });

  it("still mentions the 10-15 exchange target in the static rules regardless of pacing state", () => {
    expect(buildMeetingPrompt(makeScenario(), 0)).toContain("10–15 total exchanges");
  });
});

describe("closingLine", () => {
  it("returns a distinct, non-empty line for every counterpart role", () => {
    const lines = (["client", "non-tech", "team-engineer"] as const).map((counterpartRole) =>
      closingLine(makeScenario({ counterpartRole })),
    );
    for (const line of lines) expect(line.trim()).not.toBe("");
    expect(new Set(lines).size).toBe(lines.length);
  });
});
