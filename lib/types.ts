import type { CertId } from "@/data/domains";
import type { z } from "zod";
import type { GeneratedScenarioSchema, DebriefOutput } from "./schemas";

export type Message = { role: "user" | "assistant"; content: string };
export type LLMOpts = { temperature?: number };

export type SessionConfig = {
  userId: string;
  cert: CertId;
  role: "solutions-architect" | "senior-developer" | "team-lead";
  // "junior-dev" was removed — no difficulty ever mapped to it, so it was
  // unreachable from the UI. See CLAUDE.md's difficulty->counterpart table.
  counterpartRole: "client" | "non-tech" | "team-engineer";
  difficulty: "beginner" | "intermediate" | "expert";
};

// Everything the model generates, plus the config fields it never gets to
// invent. difficulty, counterpartRole, and cert always come from
// SessionConfig — see CLAUDE.md Hard Invariant #6.
export type ScenarioOutput = z.infer<typeof GeneratedScenarioSchema> & {
  difficulty: SessionConfig["difficulty"];
  counterpartRole: SessionConfig["counterpartRole"];
  cert: CertId;
};

export type { DebriefOutput } from "./schemas";

// This session's observed score per domain, already filtered to domain IDs
// valid for the active cert. debriefAgent computes and returns it; nothing
// else invents one. See CLAUDE.md, "The Feedback Loop".
export type DomainScoreDelta = Record<string, number>;

export type SessionResult = {
  sessionId: string;
  date: number;
  scenario: ScenarioOutput;
  scores: DebriefOutput["scores"];
  domainsExercised: string[];
};

export type CertProgress = {
  domainScores: Record<string, number>;
  sessions: SessionResult[];
  seenCombinations: string[];
};

export type UserModel = {
  userId: string;
  certs: Partial<Record<CertId, CertProgress>>;
};

// What the Scenario Agent is allowed to see — the projection of a
// CertProgress it actually has use for. Session history (full past
// scenarios, per-session scores, dates) is deliberately excluded: it grows
// unboundedly and the agent never reads it. attemptedDomainIds is the one
// derived fact from session history the agent's weight-adjusted targeting
// does need, so it's precomputed client-side rather than sending the
// sessions themselves. See CLAUDE.md, Agent Contracts — Scenario Agent.
export type ScenarioContext = {
  domainScores: Record<string, number>;
  seenCombinations: string[];
  attemptedDomainIds: string[];
};
