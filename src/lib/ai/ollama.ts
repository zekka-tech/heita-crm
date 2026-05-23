import { logger } from "@/lib/logger";

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

export async function* streamOllamaChat(
  options: OllamaChatOptions
): AsyncGenerator<string> {
  const baseUrl =
    options.baseUrl ??
    process.env.OLLAMA_BASE_URL ??
    "http://localhost:11434";
  const model = options.model ?? process.env.OLLAMA_CHAT_MODEL ?? "llama3.2";

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: options.messages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.4
      }
    }),
    signal: options.signal
  });

  if (!response.ok || !response.body) {
    throw new Error(`Ollama chat failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as {
          message?: { content?: string };
          done?: boolean;
        };
        if (event.message?.content) yield event.message.content;
      } catch (error) {
        logger.warn({ err: error, line: trimmed }, "ollama.parse_failed");
      }
    }
  }
}
