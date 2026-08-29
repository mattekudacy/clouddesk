// agents/meetingAgent.ts
import { callLLM } from "@/lib/llm";
import { buildMeetingPrompt } from "@/prompts/meetingAgent";
import type { ScenarioOutput, Message } from "@/lib/types";

export async function meetingAgentReply(
  scenario: ScenarioOutput,
  history: Message[],
): Promise<string> {
  // exchangeCount = number of assistant messages so far
  const exchangeCount = history.filter((m) => m.role === "assistant").length;
  const systemPrompt = buildMeetingPrompt(scenario, exchangeCount);

  const reply = await callLLM(systemPrompt, history, { temperature: 0.85 });
  return reply.trim();
}
