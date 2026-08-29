// lib/domainPriority.ts
// Pure, storage-free domain-priority logic shared by the Scenario Agent's
// validateScenario tool (server-side, authoritative) and every client-side
// "which domain needs work" display (Brief's loop-transparency copy,
// Dashboard's DomainBars). One implementation, one set of tests — the
// previous version of this logic was duplicated (and drifted) between
// lib/userModel.ts and components/Dashboard/DomainBars.tsx.
//
// See CLAUDE.md, Agent Contracts — Scenario Agent: "Weakest-domain
// selection is weight-adjusted, since a mediocre score in a heavily
// weighted domain matters more than a poor one in a minor domain.
// Unattempted domains rank as weakest."
import type { CertProgress } from "./types";

export type DomainWeight = { id: string; weight: number };

/**
 * Picks the domain that most needs practice.
 *
 * Unattempted domains always win first — there's no signal yet, so they're
 * the biggest unknown. Among attempted domains, the one with the highest
 * `weight * (100 - score)` — the weighted gap — wins: a domain scored 70 at
 * weight 0.30 (gap 9.0) outranks one scored 40 at weight 0.10 (gap 6.0).
 */
export function pickWeakestDomain(
  domainScores: Record<string, number>,
  domains: readonly DomainWeight[],
  attempted: ReadonlySet<string>,
): string {
  if (domains.length === 0) {
    throw new Error("pickWeakestDomain: domains list is empty");
  }

  const unattempted = domains.filter((d) => !attempted.has(d.id));
  const pool = unattempted.length > 0 ? unattempted : domains;

  const weightedGap = (d: DomainWeight) => d.weight * (100 - (domainScores[d.id] ?? 50));

  return pool.reduce((weakest, d) => (weightedGap(d) > weightedGap(weakest) ? d : weakest)).id;
}

/** Every domain ID exercised in at least one past session for this cert. */
export function attemptedDomainIds(certProgress: CertProgress): Set<string> {
  const ids = new Set<string>();
  for (const session of certProgress.sessions) {
    for (const id of session.domainsExercised) ids.add(id);
  }
  return ids;
}
