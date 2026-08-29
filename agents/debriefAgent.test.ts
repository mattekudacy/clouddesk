import { describe, it, expect } from "vitest";
import { buildDomainScoreDelta } from "./debriefAgent";
import type { ExchangeAnalysisEntry } from "@/lib/schemas";

function entry(domainId: string, score: number): ExchangeAnalysisEntry {
  return { exchangeIndex: 0, domainId, score, type: "good", annotation: "text" };
}

describe("buildDomainScoreDelta", () => {
  it("averages per-exchange scores within a domain, not a broadcast overall score", () => {
    const delta = buildDomainScoreDelta(
      [entry("identities", 60), entry("identities", 80)],
      "az-104",
    );
    expect(delta).toEqual({ identities: 70 });
  });

  it("keeps two exercised domains independent — different scores don't get smeared together", () => {
    const delta = buildDomainScoreDelta(
      [entry("identities", 90), entry("identities", 90), entry("storage", 40)],
      "az-104",
    );
    expect(delta).toEqual({ identities: 90, storage: 40 });
  });

  it("drops domain IDs that don't belong to the active cert", () => {
    const delta = buildDomainScoreDelta(
      [entry("identities", 70), entry("not-a-real-domain", 20)],
      "az-104",
    );
    expect(delta).toEqual({ identities: 70 });
  });

  it("returns an empty object when nothing exercised is valid", () => {
    const delta = buildDomainScoreDelta([entry("hallucinated", 50)], "az-104");
    expect(delta).toEqual({});
  });
});
