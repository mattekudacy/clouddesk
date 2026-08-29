// data/domains/domains.test.ts
// Structural integrity checks for every registered cert's domain data.
//
// Adding a cert is meant to be "one data file plus one registry entry, no
// agent/prompt/storage changes" (CLAUDE.md, "Certs, Roles, Counterparts").
// That cheapness is exactly what makes this file necessary: nothing about a
// malformed domain file fails to compile, and none of these mistakes surface
// as a visible error at runtime either — they silently corrupt targeting or
// scoring forever.
//
// Specifically:
// - weights that don't sum to 1.0 silently skew pickWeakestDomain's
//   weight-adjusted ranking (lib/domainPriority.ts), so the agent targets
//   the wrong domain every session with no symptom
// - duplicate ids silently corrupt score merging (lib/userModel.ts keys
//   domainScores by id) and the per-domain delta (agents/debriefAgent.ts)
// - an empty keyServices/concepts leaves the Scenario Agent with no
//   vocabulary for that domain — buildScenarioPrompt (prompts/scenarioAgent.ts)
//   feeds those arrays straight into the prompt as the only signal for what
//   a scenario about this domain may be about
//
// These run over CERT_REGISTRY rather than a hardcoded list, so a newly
// registered cert is covered the moment it's added — including one written
// by someone who never read this file.
import { describe, it, expect } from "vitest";
import { CERT_REGISTRY, type CertId } from "./index";

type Domain = {
  id: string;
  name: string;
  weight: number;
  keyServices: readonly string[];
  concepts: readonly string[];
};

const CERT_IDS = Object.keys(CERT_REGISTRY) as CertId[];

// Domain ids are persisted in localStorage (CertProgress.domainScores keys
// and SessionResult.domainsExercised — lib/types.ts) and can never be
// renamed safely once a user has real progress saved against them. Enforce
// a boring, stable slug shape up front.
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

// Floating-point weights won't sum to exactly 1 (0.2 + 0.15 + ... drifts),
// so compare within a tolerance rather than with ===.
const WEIGHT_SUM_TOLERANCE = 1e-9;

it("registers at least one cert", () => {
  expect(CERT_IDS.length).toBeGreaterThan(0);
});

describe.each(CERT_IDS)("%s domain data", (certId) => {
  const cert = CERT_REGISTRY[certId];
  const domains = cert.domains as readonly Domain[];

  it("has a non-empty human-readable cert name", () => {
    expect(cert.name.trim()).not.toBe("");
  });

  it("defines at least two domains", () => {
    // pickWeakestDomain throws on an empty list, and a single-domain cert
    // makes the targeting loop meaningless — there's nothing to choose
    // between, so the feedback loop can't demonstrate anything.
    expect(domains.length).toBeGreaterThanOrEqual(2);
  });

  it("has exam weights summing to 1.0", () => {
    const sum = domains.reduce((total, d) => total + d.weight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(WEIGHT_SUM_TOLERANCE);
  });

  it("has a positive weight for every domain", () => {
    // A zero or negative weight makes weightedGap (lib/domainPriority.ts)
    // rank the domain last forever — it would never be targeted again once
    // attempted, which is indistinguishable from the domain not existing.
    for (const d of domains) {
      expect(d.weight, `${certId}/${d.id} weight`).toBeGreaterThan(0);
    }
  });

  it("has unique domain ids", () => {
    const ids = domains.map((d) => d.id);
    expect(new Set(ids).size, `duplicate id in ${certId}: [${ids.join(", ")}]`).toBe(ids.length);
  });

  it("uses stable kebab-case domain ids", () => {
    for (const d of domains) {
      expect(d.id, `${certId} domain id "${d.id}"`).toMatch(KEBAB_CASE);
    }
  });

  it("has a non-empty display name for every domain", () => {
    // Users never see a raw domain id (CLAUDE.md Hard Invariant #8) —
    // getDomainName falls back to the id when a domain is missing, so an
    // empty name here would surface as a blank badge in the UI.
    for (const d of domains) {
      expect(d.name.trim(), `${certId}/${d.id} name`).not.toBe("");
    }
  });

  it("gives every domain a non-empty keyServices and concepts vocabulary", () => {
    for (const d of domains) {
      expect(d.keyServices.length, `${certId}/${d.id} keyServices`).toBeGreaterThan(0);
      expect(d.concepts.length, `${certId}/${d.id} concepts`).toBeGreaterThan(0);
      for (const entry of [...d.keyServices, ...d.concepts]) {
        expect(entry.trim(), `${certId}/${d.id} vocabulary entry`).not.toBe("");
      }
    }
  });
});
