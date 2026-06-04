import { runWithCircuitBreaker } from "@/lib/circuit-breaker";
import { appendTraceHeaders } from "@/lib/tracing";
import type { StreamUsage, StreamWithUsage } from "@/lib/ai/stream-types";

export type { StreamUsage, StreamWithUsage };

type CacheableTextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

type AnthropicChatOptions = {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Mark the system prompt block for Anthropic prompt caching. */
  enablePromptCache?: boolean;
};

// Loose event shape: using optionals avoids discriminated-union narrowing issues
// since JSON.parse returns `unknown` and the actual shape is determined at runtime.
type AnthropicEvent = {
  type?: string;
  message?: {
    usage?: {
      input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      output_tokens?: number;
    };
  };
  usage?: { output_tokens?: number };
  delta?: { type?: string; text?: string };
};

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Stream a chat completion from the Anthropic Messages API.
 *
 * Returns { stream, usage } where:
 *  - stream  is an async generator yielding text chunks as they arrive
 *  - usage   is a Promise that resolves with token counts after the stream
 *            is fully consumed (or abandoned) — used for cost accounting
 *
 * When enablePromptCache is true the system block is sent with
 * cache_control: { type: "ephemeral" } and the prompt-caching beta header,
 * which caches the system prompt + context for 5 minutes. On multi-turn
 * conversations this eliminates repeated encoding of the (large) system
 * prompt for turns 2+ within the same session.
 */
export async function streamAnthropicChat(
  options: AnthropicChatOptions
): Promise<StreamWithUsage> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

  const model =
    options.model ?? process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  const systemBlocks: CacheableTextBlock[] | undefined = options.system
    ? [
        {
          type: "text",
          text: options.system,
          ...(options.enablePromptCache
            ? { cache_control: { type: "ephemeral" } }
            : {}),
        },
      ]
    : undefined;

  const headers = appendTraceHeaders({
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
    ...(options.enablePromptCache
      ? { "anthropic-beta": "prompt-caching-2024-07-31" }
      : {}),
  });

  const response = await runWithCircuitBreaker("anthropic.chat", () =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? 512,
        temperature: options.temperature ?? 0.4,
        system: systemBlocks,
        messages: options.messages,
        stream: true,
      }),
      signal: options.signal,
    })
  );

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Anthropic chat failed (${response.status}): ${text.slice(0, 200)}`
    );
  }

  // Deferred for token usage — resolves in the generator's finally block.
  let resolveUsage!: (u: StreamUsage) => void;
  const usage = new Promise<StreamUsage>((resolve) => {
    resolveUsage = resolve;
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  async function* generate(): AsyncGenerator<string> {
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;

          let event: AnthropicEvent;
          try {
            event = JSON.parse(data) as AnthropicEvent;
          } catch {
            continue;
          }

          if (event.type === "message_start" && event.message?.usage) {
            const u = event.message.usage;
            inputTokens = u.input_tokens ?? 0;
            outputTokens = u.output_tokens ?? 0;
            cacheReadTokens = u.cache_read_input_tokens ?? 0;
            cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
          } else if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens ?? outputTokens;
          } else if (
            event.type === "content_block_delta" &&
            event.delta?.type === "text_delta" &&
            event.delta.text
          ) {
            yield event.delta.text;
          }
        }
      }
    } finally {
      resolveUsage({ inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens });
    }
  }

  return { stream: generate(), usage };
}
