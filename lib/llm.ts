import { createOllama } from "ai-sdk-ollama";
import { generateText, isStepCount } from "ai";
import type { z } from "zod";
import type { Message, LLMOpts, ScenarioContext } from "./types";
import type { CertId } from "@/data/domains";
import { buildScenarioTools } from "./tools";

const ollama = createOllama({
  apiKey: process.env.OLLAMA_API_KEY,
  baseURL: "https://ollama.com",
});

const MODEL = ollama("gpt-oss:120b");

function toAIMessages(messages: Message[]) {
  const msgs = messages.length > 0 ? messages : [{ role: "user" as const, content: "Begin." }];
  return msgs.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function callLLM(
  systemPrompt: string,
  messages: Message[],
  opts: LLMOpts = {},
): Promise<string> {
  const { text } = await generateText({
    model: MODEL,
    instructions: systemPrompt,
    messages: toAIMessages(messages),
    temperature: opts.temperature ?? 0.8,
  });
  return text;
}

export async function callLLMWithTools(
  systemPrompt: string,
  messages: Message[],
  context: ScenarioContext,
  certId: CertId,
  opts: LLMOpts = {},
): Promise<string> {
  const tools = buildScenarioTools(context, certId);
  const { text } = await generateText({
    model: MODEL,
    instructions: systemPrompt,
    messages: toAIMessages(messages),
    tools,
    // The documented flow (see buildScenarioPrompt) is up to 5 tool-using
    // steps on the "invalid the first time" path: readDomainScores,
    // listSeenCombinations, validateScenario (invalid), validateScenario
    // (fixed), then the final JSON text. isStepCount(4) cut that path off
    // one step short of ever emitting text — the loop would hit its cap
    // mid-tool-call and `text` would come back empty. 6 leaves headroom.
    stopWhen: isStepCount(6),
    temperature: opts.temperature ?? 0.8,
  });
  return text;
}

// Shared retry loop: call the model, strip fences, parse JSON, validate
// against `schema`. On failure, retry once with the validation error
// appended to the prompt; fail loudly on the second miss. Never coerce,
// never fill defaults, never return partial output. See CLAUDE.md,
// "The LLM Boundary".
async function parseWithRetry<T>(
  schema: z.ZodType<T>,
  call: (prompt: string) => Promise<string>,
  systemPrompt: string,
): Promise<T> {
  let lastRaw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? systemPrompt
        : `${systemPrompt}\n\nYour previous response failed validation:\n${lastRaw}\n\nFix it and return ONLY valid JSON matching the required shape.`;

    const raw = await call(prompt);
    lastRaw = raw;

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch {
      lastRaw = `${raw}\n\nThis was not valid JSON — it could not even be parsed.`;
      continue;
    }

    const result = schema.safeParse(parsed);
    if (result.success) return result.data;
    lastRaw = `${raw}\n\nValidation errors: ${result.error.message}`;
  }
  throw new Error(
    `callLLMJSON: response failed schema validation after 2 attempts. Last raw: ${lastRaw.slice(0, 500)}`,
  );
}

export async function callLLMJSON<T>(
  schema: z.ZodType<T>,
  systemPrompt: string,
  messages: Message[],
  opts: LLMOpts = {},
): Promise<T> {
  return parseWithRetry(schema, (prompt) => callLLM(prompt, messages, opts), systemPrompt);
}

export async function callLLMWithToolsJSON<T>(
  schema: z.ZodType<T>,
  systemPrompt: string,
  messages: Message[],
  context: ScenarioContext,
  certId: CertId,
  opts: LLMOpts = {},
): Promise<T> {
  return parseWithRetry(
    schema,
    (prompt) => callLLMWithTools(prompt, messages, context, certId, opts),
    systemPrompt,
  );
}
