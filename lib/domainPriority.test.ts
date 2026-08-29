import { describe, it, expect } from "vitest";
import { pickWeakestDomain, attemptedDomainIds } from "./domainPriority";
import type { CertProgress } from "./types";

describe("pickWeakestDomain", () => {
  it("prioritizes a mediocre score in a heavily-weighted domain over a poor score in a minor one", () => {
    // gap(major) = 0.30 * (100-70) = 9.0 ; gap(minor) = 0.10 * (100-40) = 6.0
    const domains = [
      { id: "major", weight: 0.3 },
      { id: "minor", weight: 0.1 },
    ];
    const scores = { major: 70, minor: 40 };
    expect(pickWeakestDomain(scores, domains, new Set(["major", "minor"]))).toBe("major");
  });

  it("ranks any unattempted domain above every attempted domain, regardless of score", () => {
    const domains = [
      { id: "attempted-low", weight: 0.5 },
      { id: "never-tried", weight: 0.1 },
    ];
    const scores = { "attempted-low": 10, "never-tried": 50 };
    expect(pickWeakestDomain(scores, domains, new Set(["attempted-low"]))).toBe("never-tried");
  });

  it("falls back to weighted-gap ranking among unattempted domains when several are unattempted", () => {
    const domains = [
      { id: "a", weight: 0.2 },
      { id: "b", weight: 0.4 },
    ];
    // Both unattempted default to score 50 via the caller's domainScores map;
    // here we simulate that by omitting them, so weightedGap uses the ?? 50
    // fallback and the higher-weight domain wins the tie.
    expect(pickWeakestDomain({}, domains, new Set())).toBe("b");
  });

  it("picks the single domain when only one exists", () => {
    const domains = [{ id: "only", weight: 1 }];
    expect(pickWeakestDomain({ only: 90 }, domains, new Set(["only"]))).toBe("only");
  });

  it("throws on an empty domain list rather than returning a nonsense value", () => {
    expect(() => pickWeakestDomain({}, [], new Set())).toThrow();
  });
});

describe("attemptedDomainIds", () => {
  function makeCertProgress(domainsExercisedPerSession: string[][]): CertProgress {
    return {
      domainScores: {},
      seenCombinations: [],
      sessions: domainsExercisedPerSession.map((domainsExercised, i) => ({
        sessionId: `s${i}`,
        date: i,
        // Only domainsExercised is read by attemptedDomainIds — the rest is
        // irrelevant filler to satisfy the SessionResult shape.
        scenario: {} as CertProgress["sessions"][number]["scenario"],
        scores: {} as CertProgress["sessions"][number]["scores"],
        domainsExercised,
      })),
    };
  }

  it("collects domain IDs across every session, de-duplicated", () => {
    const cp = makeCertProgress([["identities"], ["identities", "storage"]]);
    expect(attemptedDomainIds(cp)).toEqual(new Set(["identities", "storage"]));
  });

  it("returns an empty set for a cert with no sessions yet", () => {
    expect(attemptedDomainIds(makeCertProgress([]))).toEqual(new Set());
  });
});
