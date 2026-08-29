import { describe, it, expect } from "vitest";
import { GeneratedScenarioSchema, makeExchangeAnalysisEntrySchema, DebriefOutputSchema } from "./schemas";

describe("GeneratedScenarioSchema", () => {
  it("accepts a well-formed scenario with no config fields", () => {
    const result = GeneratedScenarioSchema.safeParse({
      clientName: "Priya Shah",
      clientTitle: "Operations Director",
      companyName: "Northwind Traders",
      industry: "Logistics",
      problemStatement: "Our warehouse system keeps losing track of inventory during peak season.",
      constraint: "Must not require new hires to run it.",
      targetDomains: ["identities"],
      curveball: "A regional office suddenly needs read-only access.",
      voiceId: "af_sarah",
    });
    expect(result.success).toBe(true);
  });

  it("ignores extra fields like difficulty — the agent overwrites those from config regardless", () => {
    const result = GeneratedScenarioSchema.safeParse({
      clientName: "Priya Shah",
      clientTitle: "Operations Director",
      companyName: "Northwind Traders",
      industry: "Logistics",
      problemStatement: "text",
      constraint: "text",
      targetDomains: ["identities"],
      curveball: "text",
      voiceId: "af_sarah",
      difficulty: "beginner", // extra field — schema doesn't require or reject it
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown voiceId", () => {
    const result = GeneratedScenarioSchema.safeParse({
      clientName: "Priya Shah",
      clientTitle: "Operations Director",
      companyName: "Northwind Traders",
      industry: "Logistics",
      problemStatement: "text",
      constraint: "text",
      targetDomains: ["identities"],
      curveball: "text",
      voiceId: "en_robot",
    });
    expect(result.success).toBe(false);
  });
});

describe("makeExchangeAnalysisEntrySchema", () => {
  const schema = makeExchangeAnalysisEntrySchema(["identities", "storage"]);

  it("accepts a well-formed exchange analysis entry", () => {
    const result = schema.safeParse({
      exchangeIndex: 2,
      domainId: "identities",
      score: 75,
      type: "incomplete",
      annotation: "Correct direction but missing justification.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a score outside 0-100", () => {
    const result = schema.safeParse({
      exchangeIndex: 0,
      domainId: "identities",
      score: 150,
      type: "good",
      annotation: "text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a domainId outside this scenario's targetDomains", () => {
    const result = schema.safeParse({
      exchangeIndex: 0,
      domainId: "not-a-target-domain",
      score: 80,
      type: "good",
      annotation: "text",
    });
    expect(result.success).toBe(false);
  });
});

describe("DebriefOutputSchema", () => {
  it("accepts a well-formed debrief", () => {
    const result = DebriefOutputSchema.safeParse({
      scores: { technicalAccuracy: 80, depthOfExplanation: 70, domainCoverage: 75, communicationClarity: 85, overall: 78 },
      moments: [{ exchangeIndex: 0, type: "good", userMessage: "text", annotation: "text" }],
      examIntel: { domainsExercised: ["identities"], examQuestionExample: "text", keyConceptsTested: ["text"] },
      studyNext: { weakAreas: ["text"], suggestedTopics: ["text"], suggestedNextScenario: "text" },
    });
    expect(result.success).toBe(true);
  });

  it("defaults domainsExercised to [] when the model omits it — it's no longer requested (see prompts/debriefAgent.ts), agents/debriefAgent.ts always overwrites it before returning", () => {
    const result = DebriefOutputSchema.safeParse({
      scores: { technicalAccuracy: 80, depthOfExplanation: 70, domainCoverage: 75, communicationClarity: 85, overall: 78 },
      moments: [],
      examIntel: { examQuestionExample: "text", keyConceptsTested: ["text"] },
      studyNext: { weakAreas: ["text"], suggestedTopics: ["text"], suggestedNextScenario: "text" },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.examIntel.domainsExercised).toEqual([]);
  });
});
