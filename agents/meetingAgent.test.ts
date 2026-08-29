import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScenarioOutput, Message } from "@/lib/types";
import { MAX_EXCHANGES, closingLine } from "@/prompts/meetingAgent";

// meetingAgentReply's own job: compute exchangeCount from history, and
// either short-circuit at MAX_EXCHANGES (no LLM call — see
// agents/meetingAgent.ts's comment on why that ceiling has to be
// code-enforced, not just prompted) or build the prompt and call callLLM.
// The prompt's own content (curveball timing, pacing instructions) is
// covered by prompts/meetingAgent.test.ts; mock callLLM here so this file
// only exercises meetingAgentReply's wiring.
const { callLLMMock } = vi.hoisted(() => ({ callLLMMock: vi.fn() }));

vi.mock("@/lib/llm", () => ({ callLLM: callLLMMock }));

const { meetingAgentReply } = await import("./meetingAgent");

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

function assistantHistory(count: number): Message[] {
  const history: Message[] = [];
  for (let i = 0; i < count; i++) {
    history.push({ role: "assistant", content: `reply ${i}` });
    history.push({ role: "user", content: `user ${i}` });
  }
  return history;
}

beforeEach(() => {
  callLLMMock.mockReset();
});

describe("meetingAgentReply", () => {
  it("calls the LLM and returns its trimmed reply below MAX_EXCHANGES", async () => {
    callLLMMock.mockResolvedValueOnce("  Hello there.  ");
    const reply = await meetingAgentReply(makeScenario(), assistantHistory(2));
    expect(reply).toBe("Hello there.");
    expect(callLLMMock).toHaveBeenCalledTimes(1);
  });

  it("never calls the LLM once exchangeCount reaches MAX_EXCHANGES — hard ceiling, not just a prompted target", async () => {
    const scenario = makeScenario();
    const reply = await meetingAgentReply(scenario, assistantHistory(MAX_EXCHANGES));
    expect(callLLMMock).not.toHaveBeenCalled();
    expect(reply).toBe(closingLine(scenario));
  });

  it("still calls the LLM one turn before the ceiling, with a stronger wrap-up instruction", async () => {
    callLLMMock.mockResolvedValueOnce("Wrapping up now.");
    await meetingAgentReply(makeScenario(), assistantHistory(MAX_EXCHANGES - 1));
    expect(callLLMMock).toHaveBeenCalledTimes(1);
    const [systemPrompt] = callLLMMock.mock.calls[0] as [string, Message[], unknown];
    expect(systemPrompt).toContain("THIS IS YOUR FINAL MESSAGE");
  });

  it("returns the counterpart-appropriate closing line at the ceiling for each counterpart type", async () => {
    for (const counterpartRole of ["client", "non-tech", "team-engineer"] as const) {
      const scenario = makeScenario({ counterpartRole });
      const reply = await meetingAgentReply(scenario, assistantHistory(MAX_EXCHANGES + 3));
      expect(reply).toBe(closingLine(scenario));
    }
    expect(callLLMMock).not.toHaveBeenCalled();
  });
});
