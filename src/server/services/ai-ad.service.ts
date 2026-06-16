import { MessageChannel } from "@prisma/client";

import { embedText } from "@/lib/ai/embeddings";
import { generateText } from "@/lib/ai/generate";
import { hybridSearch } from "@/lib/ai/vector-store";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  assertAiMessageQuotaAvailable,
  recordAiTokenUsage
} from "@/server/services/ai-usage.service";

/**
 * AI-assisted ad/campaign copy generation (Tier-1 advertising monetization).
 *
 * Drafts several channel-tuned promotion-copy variants grounded in the
 * business's own knowledge (RAG). It reuses the shared `generateText` provider
 * chain (Ollama → Anthropic → fallback) and is **metered against the business's
 * AI message allowance** — heavy use drives plan upgrades, which is the
 * monetization hook. Enforcement is the same monthly AI cap used by the chat
 * co-worker (`assertAiMessageQuotaAvailable`).
 */

export type AdCopyChannel = "WHATSAPP" | "SMS" | "EMAIL" | "IN_APP";

export type AdCopyVariant = {
  headline: string;
  body: string;
  cta: string;
};

export type AdCopyResult = {
  channel: AdCopyChannel;
  variants: AdCopyVariant[];
  runtime: string;
  model: string | null;
};

const MAX_OFFER_LENGTH = 500;
const MAX_KNOWLEDGE = 4;
const MIN_VARIANTS = 1;
const MAX_VARIANTS = 5;
const DEFAULT_VARIANTS = 3;

function channelGuidance(channel: AdCopyChannel): string {
  switch (channel) {
    case "SMS":
      return "Channel: SMS. Each body must be under 160 characters, plain text, no markdown or emoji spam.";
    case "EMAIL":
      return "Channel: Email. Bodies may be up to 90 words, warm and specific, plain text.";
    case "WHATSAPP":
      return "Channel: WhatsApp. Friendly South African retail tone, under 60 words, at most one emoji, no markdown.";
    case "IN_APP":
      return "Channel: in-app notification. Punchy and short, under 30 words.";
  }
}

async function knowledgeContext(businessId: string, queryText: string): Promise<string> {
  try {
    const queryEmbedding = await embedText(queryText);
    const matches = await hybridSearch({
      businessId,
      queryText,
      queryEmbedding,
      candidateLimit: MAX_KNOWLEDGE
    });
    return matches
      .slice(0, MAX_KNOWLEDGE)
      .map((match, index) => `Knowledge ${index + 1}: ${match.content.slice(0, 700)}`)
      .join("\n\n");
  } catch (error) {
    logger.warn({ err: error, businessId }, "ai.ad_copy.knowledge_failed");
    return "";
  }
}

function clampVariantCount(count: number | undefined): number {
  if (!count || !Number.isFinite(count)) return DEFAULT_VARIANTS;
  return Math.min(MAX_VARIANTS, Math.max(MIN_VARIANTS, Math.floor(count)));
}

function sanitizeField(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

/**
 * Best-effort parse of the model output into structured variants. Models are
 * instructed to return a JSON array; we tolerate surrounding prose by extracting
 * the first bracketed block, and drop any malformed entries.
 */
function parseVariants(text: string, limit: number): AdCopyVariant[] {
  const candidates: unknown[] = [];
  const tryPush = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) candidates.push(...parsed);
    } catch {
      /* ignore */
    }
  };

  tryPush(text);
  if (candidates.length === 0) {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end > start) tryPush(text.slice(start, end + 1));
  }

  const variants: AdCopyVariant[] = [];
  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const headline = sanitizeField(record.headline ?? record.title, 80);
    const body = sanitizeField(record.body ?? record.text ?? record.message, 600);
    const cta = sanitizeField(record.cta ?? record.call_to_action ?? record.action, 40);
    if (!body && !headline) continue;
    variants.push({ headline, body, cta });
    if (variants.length >= limit) break;
  }
  return variants;
}

export async function generateAdCopy(input: {
  businessId: string;
  userId?: string | null;
  offer: string;
  channel: AdCopyChannel;
  variantCount?: number;
}): Promise<AdCopyResult> {
  const offer = input.offer.trim().slice(0, MAX_OFFER_LENGTH);
  if (!offer) {
    throw new Error("An offer or campaign description is required.");
  }
  const limit = clampVariantCount(input.variantCount);
  const channel: AdCopyChannel = input.channel ?? "WHATSAPP";

  // Enforce the monthly AI allowance — throws AiUsageQuotaExceededError when over.
  await assertAiMessageQuotaAvailable({ businessId: input.businessId });

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: input.businessId },
    select: { name: true, category: true, city: true, province: true }
  });

  const knowledge = await knowledgeContext(input.businessId, offer);

  const system = [
    "You are a South African retail marketing copywriter for Heita CRM.",
    "Write promotional copy that businesses send to their loyalty customers.",
    "Do NOT invent specific discounts, prices, stock levels, dates, or delivery terms that are not in the offer brief.",
    "Do not mention AI, internal systems, or Heita itself.",
    channelGuidance(channel),
    `Return ONLY a JSON array of ${limit} objects, each with "headline", "body", and "cta" string fields. No prose outside the JSON.`
  ].join("\n");

  const prompt = [
    `Business: ${business.name} (${business.category}${business.city ? `, ${business.city}` : ""})`,
    `Offer brief: ${offer}`,
    knowledge ? `Business knowledge (use only if relevant):\n${knowledge}` : "Business knowledge: none available",
    `Produce ${limit} distinct copy variants with different angles.`
  ].join("\n\n");

  const result = await generateText({
    system,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 700,
    temperature: 0.7,
    enablePromptCache: true,
    fallbackText: "[]"
  });

  let variants = parseVariants(result.text, limit);

  // Never return an empty result — fall back to a single safe variant built from
  // the brief so the UI always has something actionable.
  if (variants.length === 0) {
    variants = [
      {
        headline: `${business.name}`,
        body: offer,
        cta: "Visit us"
      }
    ];
  }

  // Meter the spend against the AI allowance (best-effort; never blocks output).
  try {
    await recordAiTokenUsage({
      businessId: input.businessId,
      userId: input.userId ?? null,
      runtime: result.runtime,
      model: result.model,
      promptTokens: result.usage.inputTokens,
      completionTokens: result.usage.outputTokens,
      totalTokens: result.usage.inputTokens + result.usage.outputTokens,
      messageUnits: 1
    });
  } catch (error) {
    logger.warn({ err: error, businessId: input.businessId }, "ai.ad_copy.usage_record_failed");
  }

  return { channel, variants, runtime: result.runtime, model: result.model };
}

export function isAdCopyChannel(value: unknown): value is AdCopyChannel {
  return value === "WHATSAPP" || value === "SMS" || value === "EMAIL" || value === "IN_APP";
}

// Re-export for callers that map to the platform MessageChannel enum.
export const AD_COPY_CHANNELS: AdCopyChannel[] = ["WHATSAPP", "SMS", "EMAIL", "IN_APP"];
export const MESSAGE_CHANNEL_BY_AD_COPY: Record<AdCopyChannel, MessageChannel> = {
  WHATSAPP: MessageChannel.WHATSAPP,
  SMS: MessageChannel.SMS,
  EMAIL: MessageChannel.EMAIL,
  IN_APP: MessageChannel.IN_APP
};
