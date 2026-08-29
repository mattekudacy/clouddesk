// lib/userModel.ts
import { CERT_REGISTRY, type CertId } from "@/data/domains";
import { mergeDomainScore } from "./scoreMerge";
import { pickWeakestDomain as pickWeakestDomainPure, attemptedDomainIds } from "./domainPriority";
import type { UserModel, CertProgress, SessionResult, ScenarioOutput, DebriefOutput, DomainScoreDelta, ScenarioContext } from "./types";

const MODEL_KEY = "clouddesk:userModel";
const USER_ID_KEY = "clouddesk:userId";

// User identity and progress persist in localStorage — they're meant to
// survive closing the browser. In-flight session state (config, scenario,
// transcript, the current debrief) stays in sessionStorage; see the page
// components under app/. See CLAUDE.md, Stack and Environment.

export function getUserId(): string {
  if (typeof window === "undefined") return "user";
  try {
    const existing = localStorage.getItem(USER_ID_KEY);
    if (existing) return existing;
    const generated = `user-${Date.now()}`;
    localStorage.setItem(USER_ID_KEY, generated);
    return generated;
  } catch {
    // Storage access itself threw (e.g. SecurityError in strict privacy
    // modes) — fall back to a fresh, non-persisted id rather than throwing.
    // See CLAUDE.md, Failure Behavior.
    return `user-${Date.now()}`;
  }
}

function initCertProgress(certId: CertId): CertProgress {
  const domains = CERT_REGISTRY[certId].domains as readonly { id: string }[];
  const domainScores = Object.fromEntries(domains.map((d) => [d.id, 50]));
  return { domainScores, sessions: [], seenCombinations: [] };
}

export function readUserModel(userId: string): UserModel {
  if (typeof window === "undefined") {
    return { userId, certs: {} };
  }
  let raw: string | null;
  try {
    raw = localStorage.getItem(MODEL_KEY);
  } catch {
    // Storage access itself threw — degrade to the same clean empty model
    // used for missing/corrupt data. See CLAUDE.md, Failure Behavior.
    return { userId, certs: {} };
  }
  if (!raw) {
    return { userId, certs: {} };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { userId, certs: {} };
  }
  // Stale-data guard: v1 model had domainScores at top level, not certs
  if (!parsed.certs || typeof parsed.certs !== "object") {
    return { userId, certs: {} };
  }
  return parsed as UserModel;
}

export function getCertProgress(userModel: UserModel, certId: CertId): CertProgress {
  return userModel.certs[certId] ?? initCertProgress(certId);
}

/**
 * Narrows a CertProgress down to what the Scenario Agent is allowed to see
 * before it crosses the network — see ScenarioContext in lib/types.ts. This
 * is the seam CLAUDE.md describes: pure agents never touch storage, so the
 * client (orchestrator.ts) reads the full model and hands the agent only
 * the projection.
 */
export function toScenarioContext(certProgress: CertProgress): ScenarioContext {
  return {
    domainScores: certProgress.domainScores,
    seenCombinations: certProgress.seenCombinations,
    attemptedDomainIds: Array.from(attemptedDomainIds(certProgress)),
  };
}

/**
 * Applies this session's debrief to the stored user model: merges the
 * per-domain delta (EMA, alpha = 0.4, first observation raw) and appends
 * the session to history. The only caller is agents/orchestrator.ts,
 * client-side, after the debrief API response lands. See CLAUDE.md, Hard
 * Invariant #3 and "The Feedback Loop".
 */
export function updateUserModel(
  certId: CertId,
  scenario: ScenarioOutput,
  debrief: DebriefOutput,
  delta: DomainScoreDelta,
): void {
  if (typeof window === "undefined") return;
  const userId = getUserId();
  const model = readUserModel(userId);
  const certProgress = getCertProgress(model, certId);

  for (const [domainId, sessionScore] of Object.entries(delta)) {
    if (!(domainId in certProgress.domainScores)) continue; // defense in depth — delta is already filtered upstream
    const hasPriorAttempt = certProgress.sessions.some((s) => s.domainsExercised.includes(domainId));
    certProgress.domainScores[domainId] = mergeDomainScore(
      certProgress.domainScores[domainId],
      sessionScore,
      hasPriorAttempt,
    );
  }

  const session: SessionResult = {
    sessionId: `${userId}-${Date.now()}`,
    date: Date.now(),
    scenario,
    scores: debrief.scores,
    domainsExercised: debrief.examIntel.domainsExercised,
  };
  certProgress.sessions.push(session);

  const combo = `${scenario.industry}:${scenario.problemStatement.slice(0, 40)}`;
  if (!certProgress.seenCombinations.includes(combo)) {
    certProgress.seenCombinations.push(combo);
  }

  model.userId = userId;
  model.certs[certId] = certProgress;
  try {
    localStorage.setItem(MODEL_KEY, JSON.stringify(model));
  } catch (err) {
    // Best-effort persistence — never break the debrief flow on a storage
    // throw. See CLAUDE.md, Failure Behavior.
    console.error("updateUserModel: failed to persist to localStorage", err);
  }
}

/**
 * Weight-adjusted weakest-domain lookup for client-side display (Brief's
 * loop-transparency copy, Dashboard's DomainBars) — a thin adapter over the
 * shared, tested algorithm in lib/domainPriority.ts. The Scenario Agent's
 * own targeting uses the same algorithm independently, server-side, via
 * lib/tools.ts's validateScenario.
 */
export function pickWeakestDomain(certProgress: CertProgress, certId: CertId): string {
  const domains = CERT_REGISTRY[certId].domains as readonly { id: string; weight: number }[];
  return pickWeakestDomainPure(certProgress.domainScores, domains, attemptedDomainIds(certProgress));
}

/** Serializes the full user model for the dashboard's export control. */
export function exportUserModel(userId: string): string {
  return JSON.stringify(readUserModel(userId), null, 2);
}

/**
 * Replaces the stored user model from an exported JSON string. Throws on
 * malformed input so the dashboard can show the error rather than silently
 * discarding existing progress.
 */
export function importUserModel(raw: string): UserModel {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("File does not look like a CloudDesk user model export.");
  }
  if (!parsed.certs || typeof parsed.certs !== "object" || typeof parsed.userId !== "string") {
    throw new Error("File does not look like a CloudDesk user model export.");
  }
  const model = parsed as UserModel;
  try {
    localStorage.setItem(MODEL_KEY, JSON.stringify(model));
    localStorage.setItem(USER_ID_KEY, model.userId);
  } catch {
    // Distinct from the "malformed file" error above — the import parsed
    // fine, but storage itself refused the write, so the caller needs to
    // know progress was NOT actually persisted.
    throw new Error("Could not save imported progress — storage may be unavailable.");
  }
  return model;
}

/** Clears all stored progress. Used by the dashboard's reset control. */
export function resetUserModel(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(MODEL_KEY);
  } catch (err) {
    // A failed reset in a storage-unavailable environment is a no-op, not a
    // crash. See CLAUDE.md, Failure Behavior.
    console.error("resetUserModel: failed to clear localStorage", err);
  }
}
