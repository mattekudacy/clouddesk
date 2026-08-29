import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// generateText is the one real network call in this module — mocked so the
// retry loop (parseWithRetry, private to lib/llm.ts) can be exercised
// through its public callLLMJSON entry point without hitting Ollama. This
// was previously the least-tested code in the app despite being the most
// failure-prone: every agent's output passes through this exact loop.
const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: generateTextMock };
});

vi.mock("ai-sdk-ollama", () => ({
  createOllama: () => () => ({}),
}));

const { callLLMJSON } = await import("./llm");

const TestSchema = z.object({ ok: z.boolean() });

beforeEach(() => {
  generateTextMock.mockReset();
});

describe("callLLMJSON (parseWithRetry)", () => {
  it("returns parsed data on the first valid response, with no retry", async () => {
    generateTextMock.mockResolvedValueOnce({ text: JSON.stringify({ ok: true }) });
    const result = await callLLMJSON(TestSchema, "sys", []);
    expect(result).toEqual({ ok: true });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on unparseable JSON and succeeds on the second attempt", async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: "not json at all" })
      .mockResolvedValueOnce({ text: JSON.stringify({ ok: true }) });
    const result = await callLLMJSON(TestSchema, "sys", []);
    expect(result).toEqual({ ok: true });
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on well-formed JSON that fails schema validation", async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: JSON.stringify({ ok: "not-a-boolean" }) })
      .mockResolvedValueOnce({ text: JSON.stringify({ ok: true }) });
    const result = await callLLMJSON(TestSchema, "sys", []);
    expect(result).toEqual({ ok: true });
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it("strips markdown code fences before parsing", async () => {
    generateTextMock.mockResolvedValueOnce({ text: '```json\n{"ok": true}\n```' });
    const result = await callLLMJSON(TestSchema, "sys", []);
    expect(result).toEqual({ ok: true });
  });

  it("throws loudly after 2 failed attempts rather than coercing or returning partial output", async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: "garbage" })
      .mockResolvedValueOnce({ text: "still garbage" });
    await expect(callLLMJSON(TestSchema, "sys", [])).rejects.toThrow();
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it("appends the validation error to the prompt on retry so the model can self-correct", async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: JSON.stringify({ ok: "nope" }) })
      .mockResolvedValueOnce({ text: JSON.stringify({ ok: true }) });
    await callLLMJSON(TestSchema, "original prompt", []);
    const secondCallArgs = generateTextMock.mock.calls[1][0] as { instructions: string };
    expect(secondCallArgs.instructions).toContain("original prompt");
    expect(secondCallArgs.instructions).toContain("failed validation");
  });
});
