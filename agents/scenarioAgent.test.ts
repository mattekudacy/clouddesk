import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig, ScenarioContext } from "@/lib/types";

// scenarioAgent.ts's own job is thin: build the prompt, call
// callLLMWithToolsJSON, then overwrite difficulty/counterpartRole/cert from
// config regardless of what the model returned (Hard Invariant #6). The LLM
// boundary itself (retry/validation loop) is already covered by
// lib/llm.test.ts — mock callLLMWithToolsJSON directly here so these tests
// exercise scenarioAgent's wiring, not re-test the boundary.
const { callLLMWithToolsJSONMock } = vi.hoisted(() => ({
  callLLMWithToolsJSONMock: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  callLLMWithToolsJSON: callLLMWithToolsJSONMock,
}));

const { scenarioAgent } = await import("./scenarioAgent");

function makeConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    userId: "user-1",
    cert: "az-104",
    role: "solutions-architect",
    counterpartRole: "client",
    difficulty: "intermediate",
    ...overrides,
  };
}

function makeContext(): ScenarioContext {
  return { domainScores: { identities: 50 }, seenCombinations: [], attemptedDomainIds: [] };
}

const GENERATED = {
  clientName: "Priya Shah",
  clientTitle: "Operations Director",
  companyName: "Northwind Traders",
  industry: "Logistics",
  problemStatement: "Our warehouse keeps losing track of inventory during peak season.",
  constraint: "Must not require new hires to run it.",
  targetDomains: ["identities"],
  curveball: "A regional office suddenly needs read-only access.",
  voiceId: "af_sarah" as const,
};

beforeEach(() => {
  callLLMWithToolsJSONMock.mockReset();
});

describe("scenarioAgent", () => {
  it("passes config, context, and cert through to callLLMWithToolsJSON", async () => {
    callLLMWithToolsJSONMock.mockResolvedValueOnce(GENERATED);
    const config = makeConfig();
    const context = makeContext();

    await scenarioAgent(config, context);

    expect(callLLMWithToolsJSONMock).toHaveBeenCalledTimes(1);
    const [, , , calledContext, calledCertId] = callLLMWithToolsJSONMock.mock.calls[0];
    expect(calledContext).toBe(context);
    expect(calledCertId).toBe("az-104");
  });

  it("overwrites difficulty, counterpartRole, and cert from config, never from the model's output — Hard Invariant #6", async () => {
    // The model can't actually produce these fields per GeneratedScenarioSchema,
    // but even if a raw/legacy payload smuggled them in, config must win.
    callLLMWithToolsJSONMock.mockResolvedValueOnce({
      ...GENERATED,
      difficulty: "expert",
      counterpartRole: "team-engineer",
      cert: "az-500",
    } as never);
    const config = makeConfig({ difficulty: "beginner", counterpartRole: "non-tech", cert: "az-104" });

    const result = await scenarioAgent(config, makeContext());

    expect(result.difficulty).toBe("beginner");
    expect(result.counterpartRole).toBe("non-tech");
    expect(result.cert).toBe("az-104");
  });

  it("preserves every field the model actually generates", async () => {
    callLLMWithToolsJSONMock.mockResolvedValueOnce(GENERATED);
    const result = await scenarioAgent(makeConfig(), makeContext());
    expect(result.clientName).toBe(GENERATED.clientName);
    expect(result.problemStatement).toBe(GENERATED.problemStatement);
    expect(result.targetDomains).toEqual(GENERATED.targetDomains);
  });

  it("propagates a failure from the LLM boundary rather than swallowing it", async () => {
    callLLMWithToolsJSONMock.mockRejectedValueOnce(new Error("callLLMJSON: response failed schema validation"));
    await expect(scenarioAgent(makeConfig(), makeContext())).rejects.toThrow(/failed schema validation/);
  });
});
