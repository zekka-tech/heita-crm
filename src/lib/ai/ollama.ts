import { logger } from "@/lib/logger";
import type { StreamUsage, StreamWithUsage } from "@/lib/ai/stream-types";

export type { StreamUsage, StreamWithUsage };

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OllamaChatOptions = {
  baseUrl?: string;
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
};

type OllamaFrame = {
  message?: { content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
};

export function ollamaConfigured(): boolean {
  return Boolean(process.env.OLLAMA_BASE_URL);
}

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const response = await fetch(
      `${process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"}/api/tags`,
      { method: "GET", signal: AbortSignal.timeout(2000) }
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Stream a chat completion from a local Ollama model.
 *
 * Returns { stream, usage } where usage resolves with eval_count /
 * prompt_eval_count from the final Ollama frame once the stream is consumed.
 */
export async function streamOllamaChat(
  options: OllamaChatOptions
): Promise<StreamWithUsage> {
  const baseUrl =
    options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const model = options.model ?? process.env.OLLAMA_CHAT_MODEL ?? "llama3.2";

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: options.messages,
      stream: true,
      options: { temperature: options.temperature ?? 0.4 },
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Ollama chat failed (${response.status})`);
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
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let frame: OllamaFrame;
          try {
            frame = JSON.parse(trimmed) as OllamaFrame;
          } catch (error) {
            logger.warn({ err: error, line: trimmed }, "ollama.parse_failed");
            continue;
          }

          if (frame.message?.content) {
            yield frame.message.content;
          }

          if (frame.done) {
            inputTokens = frame.prompt_eval_count ?? 0;
            outputTokens = frame.eval_count ?? 0;
          }
        }
      }
    } finally {
      resolveUsage({
        inputTokens,
        outputTokens,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      });
    }
  }

  return { stream: generate(), usage };
}
