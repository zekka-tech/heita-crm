import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatTurn } from "@/lib/ai/rag";

// Control which runtimes are "configured" and what they return per test.
const ollamaConfigured = vi.fn<() => boolean>();
const anthropicConfigured = vi.fn<() => boolean>();
const streamOllamaChat = vi.fn();
const streamAnthropicChat = vi.fn();

vi.mock("@/lib/ai/ollama", () => ({
  ollamaConfigured: () => ollamaConfigured(),
  streamOllamaChat: (...args: unknown[]) => streamOllamaChat(...args),
}));

vi.mock("@/lib/ai/anthropic", () => ({
  anthropicConfigured: () => anthropicConfigured(),
  streamAnthropicChat: (...args: unknown[]) => streamAnthropicChat(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { buildQueryForRetrieval, rewriteQueryForRetrieval } = await import(
  "@/lib/ai/query-rewriter"
);

/** Build a { stream } result whose generator yields the given text once. */
function llmReply(text: string) {
  return {
    stream: (async function* () {
      yield text;
    })(),
  };
}

beforeEach(() => {
  ollamaConfigured.mockReturnValue(false);
  anthropicConfigured.mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("rewriteQueryForRetrieval", () => {
  it("returns empty string when there is no user turn", async () => {
    const out = await rewriteQueryForRetrieval([
      { role: "assistant", content: "Hello!" },
    ]);
    expect(out).toBe("");
    expect(streamOllamaChat).not.toHaveBeenCalled();
    expect(streamAnthropicChat).not.toHaveBeenCalled();
  });

  it("returns single-turn questions verbatim without calling an LLM", async () => {
    ollamaConfigured.mockReturnValue(true);
    const messages: ChatTurn[] = [
      { role: "user", content: "What are your opening hours?" },
    ];
    const out = await rewriteQueryForRetrieval(messages);
    expect(out).toBe("What are your opening hours?");
    expect(streamOllamaChat).not.toHaveBeenCalled();
  });

  it("returns long self-contained questions verbatim without an LLM call", async () => {
    ollamaConfigured.mockReturnValue(true);
    const long =
      "I would like to understand in detail what your full refund and returns policy is " +
      "for online orders placed during a promotional sale period, including timelines.";
    const messages: ChatTurn[] = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello, how can I help?" },
      { role: "user", content: long },
    ];
    const out = await rewriteQueryForRetrieval(messages);
    expect(out).toBe(long);
    expect(streamOllamaChat).not.toHaveBeenCalled();
  });

  it("rewrites a short multi-turn follow-up via Ollama", async () => {
    ollamaConfigured.mockReturnValue(true);
    streamOllamaChat.mockResolvedValue(llmReply("weekend opening hours"));

    const messages: ChatTurn[] = [
      { role: "user", content: "What are your hours?" },
      { role: "assistant", content: "We're open 08:00–18:00 on weekdays." },
      { role: "user", content: "And on weekends?" },
    ];

    const out = await rewriteQueryForRetrieval(messages);
    expect(out).toBe("weekend opening hours");
    expect(streamOllamaChat).toHaveBeenCalledOnce();
  });

  it("strips wrapping quotes and echoed prefixes from the rewrite", async () => {
    ollamaConfigured.mockReturnValue(true);
    streamOllamaChat.mockResolvedValue(
      llmReply('Standalone search query: "weekend opening hours"')
    );

    const messages: ChatTurn[] = [
      { role: "assistant", content: "We're open 08:00–18:00 on weekdays." },
      { role: "user", content: "And on weekends?" },
    ];

    const out = await rewriteQueryForRetrieval(messages);
    expect(out).toBe("weekend opening hours");
  });

  it("falls back to Anthropic when Ollama fails", async () => {
    ollamaConfigured.mockReturnValue(true);
    anthropicConfigured.mockReturnValue(true);
    streamOllamaChat.mockRejectedValue(new Error("ollama down"));
    streamAnthropicChat.mockResolvedValue(llmReply("weekend opening hours"));

    const messages: ChatTurn[] = [
      { role: "assistant", content: "We're open 08:00–18:00 on weekdays." },
      { role: "user", content: "And on weekends?" },
    ];

    const out = await rewriteQueryForRetrieval(messages);
    expect(out).toBe("weekend opening hours");
    expect(streamOllamaChat).toHaveBeenCalledOnce();
    expect(streamAnthropicChat).toHaveBeenCalledOnce();
  });

  it("falls back to the heuristic when no LLM is configured", async () => {
    const messages: ChatTurn[] = [
      { role: "assistant", content: "We're open 08:00–18:00 on weekdays." },
      { role: "user", content: "And on weekends?" },
    ];

    const out = await rewriteQueryForRetrieval(messages);
    // Heuristic prepends the prior assistant excerpt before the question.
    expect(out).toBe(buildQueryForRetrieval(messages));
    expect(out).toContain("We're open 08:00–18:00 on weekdays.");
    expect(out).toContain("And on weekends?");
  });

  it("falls back to the heuristic when the LLM returns an over-long rewrite", async () => {
    ollamaConfigured.mockReturnValue(true);
    streamOllamaChat.mockResolvedValue(llmReply("x".repeat(400)));

    const messages: ChatTurn[] = [
      { role: "assistant", content: "We're open 08:00–18:00 on weekdays." },
      { role: "user", content: "And on weekends?" },
    ];

    const out = await rewriteQueryForRetrieval(messages);
    expect(out).toBe(buildQueryForRetrieval(messages));
  });

  it("does not call an LLM for an opening short question with no prior dialogue", async () => {
    ollamaConfigured.mockReturnValue(true);
    const messages: ChatTurn[] = [{ role: "user", content: "Weekend hours?" }];

    const out = await rewriteQueryForRetrieval(messages);
    expect(out).toBe("Weekend hours?");
    expect(streamOllamaChat).not.toHaveBeenCalled();
  });
});
