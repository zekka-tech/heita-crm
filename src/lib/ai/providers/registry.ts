import { AiProvider } from "@prisma/client";

/**
 * Catalog of LLM providers a business can connect with its own API key
 * ("bring your own model"). Two wire protocols cover every entry:
 *
 *  - "anthropic"           — the Anthropic Messages API
 *  - "openai-compatible"   — the OpenAI /chat/completions shape, which
 *    OpenAI, Google Gemini, DeepSeek, MiniMax, Kimi (Moonshot) and Qwen
 *    (DashScope) all serve natively.
 *
 * CUSTOM lets a business point at any other OpenAI-compatible endpoint
 * (Mino, Opencode, Hermes / Nous Research, OpenRouter, self-hosted
 * gateways, ...) by supplying its base URL.
 *
 * `suggestedModels` are convenience defaults only — the UI accepts any
 * model identifier, so new releases never require a code change.
 */

export type ProviderKind = "anthropic" | "openai-compatible";

export type ProviderDefinition = {
  id: AiProvider;
  displayName: string;
  kind: ProviderKind;
  /** null → the business must supply its own base URL (CUSTOM only). */
  baseUrl: string | null;
  docsUrl: string;
  keyPlaceholder: string;
  defaultModel: string | null;
  suggestedModels: string[];
  allowsCustomBaseUrl: boolean;
  description: string;
};

export const PROVIDER_REGISTRY: Record<AiProvider, ProviderDefinition> = {
  [AiProvider.ANTHROPIC]: {
    id: AiProvider.ANTHROPIC,
    displayName: "Anthropic Claude",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    docsUrl: "https://platform.claude.com/docs",
    keyPlaceholder: "sk-ant-...",
    defaultModel: "claude-opus-4-8",
    suggestedModels: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
    allowsCustomBaseUrl: false,
    description: "Claude models via the Anthropic API."
  },
  [AiProvider.OPENAI]: {
    id: AiProvider.OPENAI,
    displayName: "OpenAI (ChatGPT)",
    kind: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    docsUrl: "https://platform.openai.com/docs",
    keyPlaceholder: "sk-...",
    defaultModel: "gpt-4o-mini",
    suggestedModels: ["gpt-5", "gpt-5-mini", "gpt-4o", "gpt-4o-mini"],
    allowsCustomBaseUrl: false,
    description: "GPT models via the OpenAI API."
  },
  [AiProvider.GOOGLE]: {
    id: AiProvider.GOOGLE,
    displayName: "Google Gemini",
    kind: "openai-compatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    docsUrl: "https://ai.google.dev/gemini-api/docs/openai",
    keyPlaceholder: "AIza...",
    defaultModel: "gemini-2.5-flash",
    suggestedModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
    allowsCustomBaseUrl: false,
    description: "Gemini models via Google's OpenAI-compatible endpoint."
  },
  [AiProvider.DEEPSEEK]: {
    id: AiProvider.DEEPSEEK,
    displayName: "DeepSeek",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    docsUrl: "https://api-docs.deepseek.com",
    keyPlaceholder: "sk-...",
    defaultModel: "deepseek-chat",
    suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
    allowsCustomBaseUrl: false,
    description: "DeepSeek chat and reasoning models."
  },
  [AiProvider.MINIMAX]: {
    id: AiProvider.MINIMAX,
    displayName: "MiniMax",
    kind: "openai-compatible",
    baseUrl: "https://api.minimax.io/v1",
    docsUrl: "https://platform.minimax.io/docs",
    keyPlaceholder: "eyJ...",
    defaultModel: "MiniMax-M2",
    suggestedModels: ["MiniMax-M2", "MiniMax-Text-01"],
    allowsCustomBaseUrl: false,
    description: "MiniMax models via the MiniMax open platform."
  },
  [AiProvider.KIMI]: {
    id: AiProvider.KIMI,
    displayName: "Kimi (Moonshot AI)",
    kind: "openai-compatible",
    baseUrl: "https://api.moonshot.ai/v1",
    docsUrl: "https://platform.moonshot.ai/docs",
    keyPlaceholder: "sk-...",
    defaultModel: "kimi-k2-turbo-preview",
    suggestedModels: ["kimi-k2-turbo-preview", "moonshot-v1-8k"],
    allowsCustomBaseUrl: false,
    description: "Kimi models via the Moonshot AI platform."
  },
  [AiProvider.QWEN]: {
    id: AiProvider.QWEN,
    displayName: "Qwen (Alibaba DashScope)",
    kind: "openai-compatible",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    docsUrl: "https://www.alibabacloud.com/help/en/model-studio",
    keyPlaceholder: "sk-...",
    defaultModel: "qwen-plus",
    suggestedModels: ["qwen-max", "qwen-plus", "qwen-turbo"],
    allowsCustomBaseUrl: false,
    description: "Qwen models via DashScope's OpenAI-compatible mode."
  },
  [AiProvider.CUSTOM]: {
    id: AiProvider.CUSTOM,
    displayName: "Custom (OpenAI-compatible)",
    kind: "openai-compatible",
    baseUrl: null,
    docsUrl: "",
    keyPlaceholder: "API key",
    defaultModel: null,
    suggestedModels: [],
    allowsCustomBaseUrl: true,
    description:
      "Any OpenAI-compatible endpoint — Mino, Opencode, Hermes Agent (Nous Research), OpenRouter, or a self-hosted gateway."
  }
};

export function getProviderDefinition(provider: AiProvider): ProviderDefinition {
  return PROVIDER_REGISTRY[provider];
}

export function listProviders(): ProviderDefinition[] {
  return Object.values(PROVIDER_REGISTRY);
}
