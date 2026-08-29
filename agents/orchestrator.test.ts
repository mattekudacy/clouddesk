// agents/orchestrator.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  ScenarioOutput,
  DebriefOutput,
  Message,
  SessionConfig,
  UserModel,
  DomainScoreDelta,
} from "@/lib/types";

// orchestrator.ts is the only caller of updateUserModel (CLAUDE.md Hard
// Invariant #3) and the only file that touches getCertProgress /
// toScenarioContext outside lib/userModel.ts itself. All three are mocked
// here — this file tests orchestrator's wiring and error-handling, not
// userModel's merge logic (already covered by lib/userModel.test.ts).
const { getCertProgressMock, toScenarioContextMock, updateUserModelMock } = vi.hoisted(() => ({
  getCertProgressMock: vi.fn(),
  toScenarioContextMock: vi.fn(),
  updateUserModelMock: vi.fn(),
}));

vi.mock("@/lib/userModel", () => ({
  getCertProgress: getCertProgressMock,
  toScenarioContext: toScenarioContextMock,
  updateUserModel: updateUserModelMock,
}));

const { startSession, finishSession } = await import("./orchestrator");

function makeConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    userId: "user-1",
    cert: "az-104",
    role: "solutions-architect",
    counterpartRole: "non-tech",
    difficulty: "beginner",
    ...overrides,
  };
}

function makeScenario(overrides: Partial<ScenarioOutput> = {}): ScenarioOutput {
  return {
    clientName: "Priya Shah",
    clientTitle: "Ops Director",
    companyName: "Northwind",
    industry: "Logistics",
    problemStatement: "Our warehouse system keeps losing track of inventory.",
    constraint: "No new hires to run it.",
    targetDomains: ["identities"],
    curveball: "A regional office needs read-only access.",
    voiceId: "af_sarah",
    difficulty: "beginner",
    counterpartRole: "non-tech",
    cert: "az-104",
    ...overrides,
  } as ScenarioOutput;
}

function makeDebrief(overall: number): DebriefOutput {
  return {
    scores: {
      technicalAccuracy: overall,
      depthOfExplanation: overall,
      domainCoverage: overall,
      communicationClarity: overall,
      overall,
    },
    moments: [],
    examIntel: { domainsExercised: ["identities"], examQuestionExample: "", keyConceptsTested: [] },
    studyNext: { weakAreas: [], suggestedTopics: [], suggestedNextScenario: "" },
  } as DebriefOutput;
}

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

// vitest.config.ts runs the suite under environment: "node" (no jsdom), so
// `typeof window === "undefined"` is true by default — exactly the
// server-like context assertClientSide is meant to catch. These two cases
// deliberately run first, before any other test in this file stubs window,
// so the guard is exercised under the environment's real default rather
// than a simulated one.
describe("assertClientSide guard", () => {
  it("startSession throws when called in a server-like context (no window)", async () => {
    await expect(startSession(makeConfig(), { userId: "user-1", certs: {} })).rejects.toThrow(
      /client-side only/,
    );
  });

  it("finishSession throws when called in a server-like context (no window)", async () => {
    await expect(finishSession(makeScenario(), [])).rejects.toThrow(/client-side only/);
  });
});

describe("startSession", () => {
  const userModel: UserModel = { userId: "user-1", certs: {} };
  const context = { domainScores: { identities: 50 }, seenCombinations: [], attemptedDomainIds: [] };

  beforeEach(() => {
    vi.stubGlobal("window", {});
    getCertProgressMock.mockReset().mockReturnValue({ domainScores: { identities: 50 }, sessions: [], seenCombinations: [] });
    toScenarioContextMock.mockReset().mockReturnValue(context);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the projection via toScenarioContext(getCertProgress(...)) and POSTs it with config to /api/scenario", async () => {
    const scenario = makeScenario();
    const config = makeConfig();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(true, 200, scenario));

    const result = await startSession(config, userModel);

    expect(getCertProgressMock).toHaveBeenCalledWith(userModel, config.cert);
    expect(toScenarioContextMock).toHaveBeenCalledWith(getCertProgressMock.mock.results[0].value);
    expect(fetch).toHaveBeenCalledWith("/api/scenario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, context }),
    });
    expect(result).toEqual(scenario);
  });

  it("throws using the response body's .error field when the fetch response is not ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(false, 400, { error: "bad scenario request" }));

    await expect(startSession(makeConfig(), userModel)).rejects.toThrow("bad scenario request");
  });

  it("falls back to a status-coded message when the error body can't be parsed", async () => {
    const res = {
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error("not json")),
    } as unknown as Response;
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(res);

    await expect(startSession(makeConfig(), userModel)).rejects.toThrow("Scenario API error: 500");
  });
});

describe("finishSession", () => {
  const scenario = makeScenario();
  const transcript: Message[] = [{ role: "user", content: "hi" }];
  const debrief = makeDebrief(80);
  const delta: DomainScoreDelta = { identities: 80 };

  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", vi.fn());
    updateUserModelMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs { scenario, transcript } to /api/debrief, calls updateUserModel, and returns the debrief", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(true, 200, { debrief, delta }));

    const result = await finishSession(scenario, transcript);

    expect(fetch).toHaveBeenCalledWith("/api/debrief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario, transcript }),
    });
    expect(updateUserModelMock).toHaveBeenCalledWith(scenario.cert, scenario, debrief, delta);
    expect(result).toEqual(debrief);
  });

  it("throws using the response body's .error field when the fetch response is not ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(false, 400, { error: "bad debrief request" }));

    await expect(finishSession(scenario, transcript)).rejects.toThrow("bad debrief request");
    expect(updateUserModelMock).not.toHaveBeenCalled();
  });

  it("falls back to a status-coded message when the error body can't be parsed", async () => {
    const res = {
      ok: false,
      status: 503,
      json: vi.fn().mockRejectedValue(new Error("not json")),
    } as unknown as Response;
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(res);

    await expect(finishSession(scenario, transcript)).rejects.toThrow("Debrief API error: 503");
  });

  // The named behavior from CLAUDE.md's Failure Behavior section: "If the
  // debrief succeeds but the model update throws, show the debrief anyway.
  // The user's grade is not contingent on bookkeeping."
  it("still returns the debrief when updateUserModel throws, without the error propagating", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(true, 200, { debrief, delta }));
    updateUserModelMock.mockImplementationOnce(() => {
      throw new Error("storage exploded");
    });

    const result = await finishSession(scenario, transcript);

    expect(result).toEqual(debrief);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
