type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AnthropicChatOptions = {
  system?: string;
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function* streamAnthropicChat(
  options: AnthropicChatOptions
): AsyncGenerator<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

  const model =
    options.model ?? process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? 512,
      temperature: options.temperature ?? 0.4,
      system: options.system,
      messages: options.messages,
      stream: true
    }),
    signal: options.signal
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Anthropic chat failed (${response.status}): ${text.slice(0, 200)}`
    );
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

    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]" || !data) continue;
      try {
        const event = JSON.parse(data) as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        if (event.type === "content_block_delta" && event.delta?.text) {
          yield event.delta.text;
        }
      } catch {
        // Skip malformed lines.
      }
    }
  }
}
