import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { anthropicConfigured, streamAnthropicChat } from "@/lib/ai/anthropic";
import { ollamaConfigured, streamOllamaChat } from "@/lib/ai/ollama";

export type ChatTurn = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type RagStreamInput = {
  businessId: string;
  messages: ChatTurn[];
};

const MAX_HISTORY = 10;

function defaultSystemPrompt(businessName: string): string {
  return [
    `You are the AI co-worker for ${businessName}.`,
    "Answer concisely with a friendly, helpful tone.",
    "Stick to facts about the business when known. If something is not in your provided context, say so and offer to take a message for the team.",
    "Never invent product prices, hours, or policies."
  ].join(" ");
}

async function buildSystemPrompt(input: { businessId: string }): Promise<string> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: input.businessId },
    include: { aiWorkspace: true }
  });

  const persona = business.aiWorkspace?.systemPrompt;
  return persona?.trim() || defaultSystemPrompt(business.name);
}

export async function* streamRagAnswer(
  input: RagStreamInput
): AsyncGenerator<string> {
  const systemPrompt = await buildSystemPrompt({ businessId: input.businessId });
  const history = input.messages.slice(-MAX_HISTORY);

  if (ollamaConfigured()) {
    try {
      yield* streamOllamaChat({
        messages: [
          { role: "system" as const, content: systemPrompt },
          ...history.map((turn) => ({
            role: turn.role,
            content: turn.content
          }))
        ]
      });
      return;
    } catch (error) {
      logger.warn({ err: error }, "rag.ollama_fallback");
    }
  }

  if (anthropicConfigured()) {
    yield* streamAnthropicChat({
      system: systemPrompt,
      messages: history
        .filter((turn) => turn.role !== "system")
        .map((turn) => ({
          role: turn.role === "assistant" ? "assistant" : "user",
          content: turn.content
        }))
    });
    return;
  }

  yield "AI co-worker is not configured for this environment. Add OLLAMA_BASE_URL or ANTHROPIC_API_KEY to enable replies.";
}
