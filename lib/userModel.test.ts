import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { updateUserModel, readUserModel, toScenarioContext, getCertProgress, getUserId } from "./userModel";
import type { ScenarioOutput, DebriefOutput, CertProgress } from "./types";

// vitest.config.ts runs tests under environment: "node" (no jsdom), so
// userModel.ts's `typeof window === "undefined"` guards would otherwise
// take every function straight to its no-storage fallback. This is the one
// integration point (EMA merge + session append + seenCombinations dedup,
// all driven through the real localStorage-backed functions) that was
// previously only ever exercised by hand — the rest of the suite tests
// mergeDomainScore and domainPriority in isolation, not their wiring.
function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { localStorage: Storage }).localStorage = makeMemoryStorage();
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

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
  };
}

function makeDebrief(overall: number, domainsExercised: string[]): DebriefOutput {
  return {
    scores: { technicalAccuracy: overall, depthOfExplanation: overall, domainCoverage: overall, communicationClarity: overall, overall },
    moments: [],
    examIntel: { domainsExercised, examQuestionExample: "", keyConceptsTested: [] },
    studyNext: { weakAreas: [], suggestedTopics: [], suggestedNextScenario: "" },
  };
}

// readUserModel's userId param is only a fallback default for an
// empty/corrupt store — MODEL_KEY is a single fixed localStorage key, not
// partitioned by user, so the fresh in-memory storage per test (not the ID
// string) is what actually isolates one test from the next. getUserId()
// pulls whatever updateUserModel itself generated into that fresh store.
function currentModel() {
  return readUserModel(getUserId());
}

describe("updateUserModel", () => {
  it("takes the first observation for a domain raw, not blended with the seeded baseline", () => {
    updateUserModel("az-104", makeScenario(), makeDebrief(90, ["identities"]), { identities: 90 });
    const progress = getCertProgress(currentModel(), "az-104");
    expect(progress.domainScores.identities).toBe(90);
  });

  it("blends a second session for the same domain via EMA rather than overwriting", () => {
    updateUserModel("az-104", makeScenario(), makeDebrief(90, ["identities"]), { identities: 90 });
    updateUserModel("az-104", makeScenario(), makeDebrief(50, ["identities"]), { identities: 50 });
    const progress = getCertProgress(currentModel(), "az-104");
    // 90*0.6 + 50*0.4 = 54 + 20 = 74
    expect(progress.domainScores.identities).toBe(74);
  });

  it("appends a session and records the industry:problem combination", () => {
    updateUserModel("az-104", makeScenario(), makeDebrief(80, ["identities"]), { identities: 80 });
    const progress = getCertProgress(currentModel(), "az-104");
    expect(progress.sessions).toHaveLength(1);
    expect(progress.seenCombinations).toHaveLength(1);
  });

  it("does not duplicate an already-seen combination", () => {
    const scenario = makeScenario();
    updateUserModel("az-104", scenario, makeDebrief(80, ["identities"]), { identities: 80 });
    updateUserModel("az-104", scenario, makeDebrief(85, ["identities"]), { identities: 85 });
    const progress = getCertProgress(currentModel(), "az-104");
    expect(progress.seenCombinations).toHaveLength(1);
  });

  it("ignores a delta entry for a domain ID that doesn't belong to this cert (defense in depth)", () => {
    updateUserModel("az-104", makeScenario(), makeDebrief(80, ["identities"]), { identities: 80, "not-a-real-domain": 10 });
    const progress = getCertProgress(currentModel(), "az-104");
    expect(progress.domainScores["not-a-real-domain"]).toBeUndefined();
  });
});

describe("toScenarioContext", () => {
  it("excludes session history but includes derived attemptedDomainIds", () => {
    const certProgress: CertProgress = {
      domainScores: { identities: 70, storage: 50 },
      seenCombinations: ["Logistics:combo"],
      sessions: [
        { sessionId: "s1", date: 1, scenario: {} as ScenarioOutput, scores: {} as DebriefOutput["scores"], domainsExercised: ["identities"] },
      ],
    };
    const context = toScenarioContext(certProgress);
    expect(context).toEqual({
      domainScores: { identities: 70, storage: 50 },
      seenCombinations: ["Logistics:combo"],
      attemptedDomainIds: ["identities"],
    });
    expect(context).not.toHaveProperty("sessions");
  });
});
