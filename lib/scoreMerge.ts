// lib/scoreMerge.ts
// Pure merge function for rolling per-domain scores. Kept separate from
// lib/userModel.ts so it's unit-testable without touching storage.

const ALPHA = 0.4;

/**
 * Blends a domain's stored score with this session's observed score.
 * First observation is taken raw (no blending against the seeded default) —
 * otherwise an exponential moving average with alpha = 0.4, so recent
 * sessions dominate. See CLAUDE.md, "The Feedback Loop".
 */
export function mergeDomainScore(
  previousScore: number,
  sessionScore: number,
  hasPriorAttempt: boolean,
): number {
  if (!hasPriorAttempt) return Math.round(sessionScore);
  return Math.round(previousScore * (1 - ALPHA) + sessionScore * ALPHA);
}
