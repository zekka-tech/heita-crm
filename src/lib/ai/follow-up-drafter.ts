import { MessageChannel } from "@prisma/client";

import { embedText } from "@/lib/ai/embeddings";
import { generateText, type GenerateTextResult } from "@/lib/ai/generate";
import { hybridSearch } from "@/lib/ai/vector-store";
import { logger } from "@/lib/logger";
import { withBusinessScope } from "@/lib/prisma";

const MAX_HISTORY = 20;
const MAX_KNOWLEDGE = 4;

function channelInstruction(channel: MessageChannel) {
  if (channel === MessageChannel.SMS) {
    return "Write a concise SMS under 320 characters. No markdown. Include one clear next step.";
  }
  if (channel === MessageChannel.EMAIL) {
    return "Write a polished plain-text email follow-up. Keep it personal, specific, and under 180 words.";
  }
  if (channel === MessageChannel.WHATSAPP) {
    return "Write a WhatsApp follow-up in a friendly South African retail tone. Keep it under 120 words. No markdown.";
  }
  return "Write a short in-app follow-up. Keep it clear, useful, and human.";
}

function formatDate(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : "unknown";
}

async function knowledgeContext(businessId: string, queryText: string) {
  try {
    const queryEmbedding = await embedText(queryText);
    const matches = await hybridSearch({ businessId, queryText, queryEmbedding, candidateLimit: MAX_KNOWLEDGE });
    return matches
      .slice(0, MAX_KNOWLEDGE)
      .map((match, index) => "Knowledge " + (index + 1) + ": " + match.content.slice(0, 900))
      .join("\n\n");
  } catch (error) {
    logger.warn({ err: error, businessId }, "sales.followup.knowledge_failed");
    return "";
  }
}

export async function generateFollowUpDraft(input: {
  businessId: string;
  threadId: string;
  channel: MessageChannel;
}): Promise<GenerateTextResult & { body: string }> {
  // SalesThread + Message are business-scoped; read both under the owning
  // business so RLS resolves them under the app role.
  const { thread, messages } = await withBusinessScope(input.businessId, async (tx) => {
    const thread = await tx.salesThread.findFirstOrThrow({
      where: { id: input.threadId, businessId: input.businessId },
      include: {
        business: { select: { name: true, category: true, city: true } },
        stage: true,
        membership: { include: { tier: true, user: { select: { name: true, email: true, phone: true } } } },
        documents: { orderBy: { createdAt: "desc" }, take: 3 }
      }
    });

    const messages = await tx.message.findMany({
      where: {
        businessId: input.businessId,
        OR: [
          { salesThreadId: input.threadId },
          { contactPhone: thread.contactPhone }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY,
      select: { direction: true, channel: true, body: true, createdAt: true }
    });

    return { thread, messages };
  });

  const orderedHistory = messages.reverse().map((message) => {
    return "[" + message.createdAt.toISOString() + "] " + message.channel + " " + message.direction + ": " + message.body.slice(0, 500);
  }).join("\n");

  const latestDocument = thread.documents[0];
  const queryText = [thread.title, thread.stage.label, latestDocument?.title, latestDocument?.kind].filter(Boolean).join(" ");
  const knowledge = await knowledgeContext(input.businessId, queryText || thread.title);

  const customerName = thread.membership?.user.name ?? "customer";
  const system = [
    "You draft sales follow-up messages for Heita CRM retail staff.",
    "The draft is never sent automatically; a staff member will review it.",
    "Do not invent discounts, stock, delivery dates, or payment terms.",
    "Do not mention internal systems, pipeline stages, AI, or approval queues.",
    channelInstruction(input.channel)
  ].join("\n");

  const prompt = [
    "Business: " + thread.business.name + " (" + thread.business.category + ")",
    "Customer: " + customerName + " / " + thread.contactPhone,
    "Membership: points=" + (thread.membership?.pointsBalance ?? "n/a") + ", tier=" + (thread.membership?.tier?.name ?? "n/a") + ", joined=" + formatDate(thread.membership?.joinedAt),
    "Sales thread: " + thread.title,
    "Stage: " + thread.stage.label,
    "Latest document: " + (latestDocument ? latestDocument.kind + " - " + latestDocument.title + " (" + latestDocument.fileName + ")" : "none"),
    "Last customer reply: " + formatDate(thread.lastCustomerReplyAt),
    "Last outbound: " + formatDate(thread.lastOutboundAt),
    knowledge ? "Business knowledge:\n" + knowledge : "Business knowledge: none available",
    "Recent message history:\n" + (orderedHistory || "No prior messages."),
    "Write only the follow-up message body."
  ].join("\n\n");

  const result = await generateText({
    system,
    messages: [{ role: "user", content: prompt }],
    maxTokens: input.channel === MessageChannel.SMS ? 160 : 420,
    temperature: 0.35,
    enablePromptCache: true,
    fallbackText: "Hi " + customerName + ", just checking in on " + thread.title + ". Please let us know if you have any questions or would like us to help with the next step."
  });

  return { ...result, body: result.text };
}
