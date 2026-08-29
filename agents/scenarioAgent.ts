import { callLLMWithToolsJSON } from "@/lib/llm";
import { buildScenarioPrompt } from "@/prompts/scenarioAgent";
import { GeneratedScenarioSchema } from "@/lib/schemas";
import type { ScenarioOutput, SessionConfig, ScenarioContext } from "@/lib/types";

// Receives the projection, not the full user model — narrowing already
// happened client-side (agents/orchestrator.ts, via toScenarioContext).
// This is also what makes the agent importable from a plain API route with
// no dependency on lib/userModel.ts, which is otherwise the only file
// allowed to touch storage. See CLAUDE.md Hard Invariant #2.
export async function scenarioAgent(
  config: SessionConfig,
  context: ScenarioContext,
): Promise<ScenarioOutput> {
  const systemPrompt = buildScenarioPrompt(config.role, config.counterpartRole, config.cert);

  const generated = await callLLMWithToolsJSON(
    GeneratedScenarioSchema,
    systemPrompt,
    [{
      role: "user",
      content: `Generate a ${config.difficulty} scenario for a ${config.role} talking to a ${config.counterpartRole}.`,
    }],
    context,
    config.cert,
    { temperature: 0.9 },
  );

  // difficulty, counterpartRole, and cert are never trusted from the model —
  // they're already known from config. See CLAUDE.md Hard Invariant #6.
  return {
    ...generated,
    difficulty: config.difficulty,
    counterpartRole: config.counterpartRole,
    cert: config.cert,
  };
}
