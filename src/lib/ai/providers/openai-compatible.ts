import type { StreamUsage, StreamWithUsage } from "@/lib/ai/stream-types";
import { appendTraceHeaders } from "@/lib/tracing";

export type OpenAiCompatibleChatOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

// Loose frame shape: JSON.parse returns `unknown`; optionals avoid
// discriminated-union narrowing issues (same approach as anthropic.ts).
type OpenAiStreamFrame = {
  choices?: { delta?: { content?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  } | null;
};

function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

/**
 * Stream a chat completion from any OpenAI-compatible /chat/completions
 * endpoint (OpenAI, Gemini compat mode, DeepSeek, MiniMax, Moonshot/Kimi,
 * DashScope/Qwen, custom gateways).
 *
 * Mirrors the streamAnthropicChat contract: returns { stream, usage } where
 * usage resolves with token counts once the stream has been consumed.
 */
export async function streamOpenAiCompatibleChat(
  options: OpenAiCompatibleChatOptions
): Promise<StreamWithUsage> {
  const messages = [
    ...(options.system ? [{ role: "system" as const, content: options.system }] : []),
    ...options.messages
  ];

  const response = await fetch(chatCompletionsUrl(options.baseUrl), {
    method: "POST",
    headers: appendTraceHeaders({
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      model: options.model,
      messages,
      max_tokens: options.maxTokens ?? 512,
      temperature: options.temperature ?? 0.4,
      stream: true,
      stream_options: { include_usage: true }
    }),
    signal: options.signal
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `OpenAI-compatible chat failed (${response.status}): ${text.slice(0, 200)}`
    );
  }

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

          let frame: OpenAiStreamFrame;
          try {
            frame = JSON.parse(data) as OpenAiStreamFrame;
          } catch {
            continue;
          }

          const delta = frame.choices?.[0]?.delta?.content;
          if (delta) yield delta;

          // The final frame (empty choices) carries usage when
          // stream_options.include_usage is honoured by the provider.
          if (frame.usage) {
            inputTokens = frame.usage.prompt_tokens ?? inputTokens;
            outputTokens = frame.usage.completion_tokens ?? outputTokens;
            cacheReadTokens =
              frame.usage.prompt_tokens_details?.cached_tokens ?? cacheReadTokens;
          }
        }
      }
    } finally {
      resolveUsage({
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens: 0
      });
    }
  }

  return { stream: generate(), usage };
}

/**
 * Cheapest possible liveness probe for a key/model pair: a non-streaming
 * single-token completion. Returns null on success, or a human-readable
 * error message on failure.
 */
export async function probeOpenAiCompatibleChat(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  try {
    const response = await fetch(chatCompletionsUrl(options.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1
      }),
      signal: options.signal ?? AbortSignal.timeout(15_000)
    });
    if (response.ok) return null;
    const text = await response.text().catch(() => "");
    return `Provider returned ${response.status}: ${text.slice(0, 200)}`;
  } catch (error) {
    return error instanceof Error ? error.message : "Provider request failed.";
  }
}
