// agents/meetingAgent.ts
import { callLLM } from "@/lib/llm";
import { buildMeetingPrompt, closingLine, MAX_EXCHANGES } from "@/prompts/meetingAgent";
import type { ScenarioOutput, Message } from "@/lib/types";

export async function meetingAgentReply(
  scenario: ScenarioOutput,
  history: Message[],
): Promise<string> {
  // exchangeCount = number of assistant messages so far
  const exchangeCount = history.filter((m) => m.role === "assistant").length;

  // Hard ceiling, not just a prompted target: buildMeetingPrompt already
  // pushes the model toward wrapping up before this point (see
  // FINAL_TURN_AT), but a model that ignores that instruction would let
  // the transcript grow unbounded — and agents/debriefAgent.ts scores
  // every exchange in parallel, so an unbounded transcript reopens the
  // serverless-timeout problem that parallelism was meant to fix. No LLM
  // call is made past this point; the meeting ends deterministically.
  if (exchangeCount >= MAX_EXCHANGES) {
    return closingLine(scenario);
  }

  const systemPrompt = buildMeetingPrompt(scenario, exchangeCount);

  const reply = await callLLM(systemPrompt, history, { temperature: 0.85 });
  return reply.trim();
}
