import { AiProvider } from "@prisma/client";

import { probeAnthropicChat, streamAnthropicChat } from "@/lib/ai/anthropic";
import {
  probeOpenAiCompatibleChat,
  streamOpenAiCompatibleChat
} from "@/lib/ai/providers/openai-compatible";
import { getProviderDefinition } from "@/lib/ai/providers/registry";
import type { StreamWithUsage } from "@/lib/ai/stream-types";
import { assertPublicHttpUrl } from "@/lib/security";

export type ByokRuntime = {
  connectionId: string;
  provider: AiProvider;
  /** Resolved endpoint: registry default, or the connection's custom baseUrl. */
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ByokChatOptions = {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

/**
 * Resolve the endpoint a connection should talk to. Custom base URLs are
 * re-checked against the SSRF guard on every call — DNS can change between
 * save time and request time.
 */
export async function resolveProviderBaseUrl(
  provider: AiProvider,
  customBaseUrl: string | null
): Promise<string> {
  const definition = getProviderDefinition(provider);
  if (definition.allowsCustomBaseUrl) {
    if (!customBaseUrl) {
      throw new Error(`Provider ${provider} requires a base URL.`);
    }
    await assertPublicHttpUrl(customBaseUrl);
    return customBaseUrl;
  }
  if (!definition.baseUrl) {
    throw new Error(`Provider ${provider} has no registered base URL.`);
  }
  return definition.baseUrl;
}

/** Stream a chat completion through a business-supplied provider connection. */
export async function streamByokChat(
  runtime: ByokRuntime,
  options: ByokChatOptions
): Promise<StreamWithUsage> {
  const definition = getProviderDefinition(runtime.provider);

  if (definition.kind === "anthropic") {
    return streamAnthropicChat({
      apiKey: runtime.apiKey,
      model: runtime.model,
      system: options.system,
      messages: options.messages,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      signal: options.signal,
      enablePromptCache: true
    });
  }

  if (definition.allowsCustomBaseUrl) {
    await assertPublicHttpUrl(runtime.baseUrl);
  }

  return streamOpenAiCompatibleChat({
    baseUrl: runtime.baseUrl,
    apiKey: runtime.apiKey,
    model: runtime.model,
    system: options.system,
    messages: options.messages,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    signal: options.signal
  });
}

/**
 * Verify a key/model pair with a single-token request.
 * Returns null when the credentials work, otherwise an error message.
 */
export async function probeByokConnection(input: {
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<string | null> {
  const definition = getProviderDefinition(input.provider);

  if (definition.kind === "anthropic") {
    return probeAnthropicChat({ apiKey: input.apiKey, model: input.model });
  }

  if (definition.allowsCustomBaseUrl) {
    try {
      await assertPublicHttpUrl(input.baseUrl);
    } catch (error) {
      return error instanceof Error ? error.message : "Base URL rejected.";
    }
  }

  return probeOpenAiCompatibleChat({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model
  });
}
