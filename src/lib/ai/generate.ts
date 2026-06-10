import { anthropicConfigured, streamAnthropicChat } from "@/lib/ai/anthropic";
import { ollamaConfigured, streamOllamaChat } from "@/lib/ai/ollama";
import type { StreamUsage } from "@/lib/ai/stream-types";
import { logger } from "@/lib/logger";

type GenerateMessage = {
  role: "user" | "assistant";
  content: string;
};

export type GenerateTextResult = {
  text: string;
  runtime: "ollama" | "anthropic" | "fallback";
  model: string | null;
  usage: StreamUsage;
};

type GenerateTextInput = {
  system: string;
  messages: GenerateMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  enablePromptCache?: boolean;
  fallbackText?: string;
};

const EMPTY_USAGE: StreamUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0
};

async function drainStream(stream: AsyncGenerator<string>) {
  let text = "";
  for await (const chunk of stream) {
    text += chunk;
  }
  return text.trim();
}

export async function generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
  if (ollamaConfigured()) {
    try {
      const completion = await streamOllamaChat({
        messages: [
          { role: "system", content: input.system },
          ...input.messages
        ],
        temperature: input.temperature,
        signal: input.signal
      });
      const text = await drainStream(completion.stream);
      const usage = await completion.usage;
      if (text) {
        return {
          text,
          runtime: "ollama",
          model: process.env.OLLAMA_CHAT_MODEL ?? "llama3.2",
          usage
        };
      }
    } catch (error) {
      logger.warn({ err: error }, "ai.generate.ollama_failed");
    }
  }

  if (anthropicConfigured()) {
    const completion = await streamAnthropicChat({
      system: input.system,
      messages: input.messages,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      signal: input.signal,
      enablePromptCache: input.enablePromptCache
    });
    const text = await drainStream(completion.stream);
    const usage = await completion.usage;
    if (text) {
      return {
        text,
        runtime: "anthropic",
        model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
        usage
      };
    }
  }

  return {
    text: input.fallbackText ?? "Just checking in on this. Please let us know if you have any questions or would like us to help with the next step.",
    runtime: "fallback",
    model: null,
    usage: EMPTY_USAGE
  };
}
