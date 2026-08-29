// agents/orchestrator.ts
// The single seam where pure agents meet browser storage. Runs client-side
// only — every export here calls an API route over fetch, never an agent
// directly, and this is the only file that calls updateUserModel. See
// CLAUDE.md Hard Invariant #3.
import { updateUserModel, getCertProgress, toScenarioContext } from "@/lib/userModel";
import type { ScenarioOutput, Message, SessionConfig, DebriefOutput, UserModel, DomainScoreDelta } from "@/lib/types";

function assertClientSide(fnName: string) {
  if (typeof window === "undefined") {
    throw new Error(`orchestrator.${fnName} is client-side only and cannot run in a server context.`);
  }
}

export async function startSession(
  config: SessionConfig,
  userModel: UserModel,
): Promise<ScenarioOutput> {
  assertClientSide("startSession");
  // Narrow to the projection here, at the seam, before anything crosses the
  // network — the server never sees the rest of the user's model. See
  // CLAUDE.md, Agent Contracts — Scenario Agent, and ScenarioContext in
  // lib/types.ts.
  const context = toScenarioContext(getCertProgress(userModel, config.cert));
  const res = await fetch("/api/scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config, context }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Scenario API error: ${res.status}`);
  }
  return res.json();
}

export async function finishSession(
  scenario: ScenarioOutput,
  transcript: Message[],
): Promise<DebriefOutput> {
  assertClientSide("finishSession");
  const res = await fetch("/api/debrief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario, transcript }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Debrief API error: ${res.status}`);
  }
  const { debrief, delta } = (await res.json()) as { debrief: DebriefOutput; delta: DomainScoreDelta };

  try {
    updateUserModel(scenario.cert, scenario, debrief, delta);
  } catch (err) {
    // The user's grade is never contingent on bookkeeping — show the
    // debrief anyway. See CLAUDE.md, "The Feedback Loop".
    console.error("finishSession: failed to update user model:", err);
  }

  return debrief;
}
