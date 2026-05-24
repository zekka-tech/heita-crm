import { Prisma } from "@prisma/client";

import { getBusinessPlan } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

export class AiUsageQuotaExceededError extends Error {
  constructor(
    readonly businessId: string,
    readonly limit: number,
    readonly used: number
  ) {
    super("AI quota exceeded for the current billing period.");
    this.name = "AiUsageQuotaExceededError";
  }
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function estimateTokenCount(...segments: Array<string | null | undefined>) {
  const joined = segments
    .filter((segment): segment is string => Boolean(segment && segment.trim()))
    .join("\n");

  if (!joined) {
    return 0;
  }

  return Math.max(1, Math.ceil(joined.length / 4));
}

export async function assertAiMessageQuotaAvailable(input: {
  businessId: string;
}) {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: input.businessId },
    select: { id: true, planId: true }
  });

  const plan = getBusinessPlan(business.planId);
  const limit = plan.limits.aiMessagesPerMonth;

  if (limit === null) {
    return {
      businessId: business.id,
      planId: business.planId,
      limit,
      used: 0
    };
  }

  const aggregate = await prisma.aiTokenUsage.aggregate({
    where: {
      businessId: business.id,
      createdAt: {
        gte: startOfCurrentMonth()
      }
    },
    _sum: {
      messageUnits: true
    }
  });

  const used = aggregate._sum.messageUnits ?? 0;
  if (used >= limit) {
    throw new AiUsageQuotaExceededError(business.id, limit, used);
  }

  return {
    businessId: business.id,
    planId: business.planId,
    limit,
    used
  };
}

export async function reserveAiMessageQuota(input: {
  businessId: string;
  sessionId?: string | null;
  userId?: string | null;
}) {
  return prisma.$transaction(
    async (tx) => {
      const business = await tx.business.findUniqueOrThrow({
        where: { id: input.businessId },
        select: { id: true, planId: true }
      });

      const plan = getBusinessPlan(business.planId);
      const limit = plan.limits.aiMessagesPerMonth;
      let used = 0;

      if (limit !== null) {
        const aggregate = await tx.aiTokenUsage.aggregate({
          where: {
            businessId: business.id,
            createdAt: {
              gte: startOfCurrentMonth()
            }
          },
          _sum: {
            messageUnits: true
          }
        });

        used = aggregate._sum.messageUnits ?? 0;
        if (used >= limit) {
          throw new AiUsageQuotaExceededError(business.id, limit, used);
        }
      }

      const usage = await tx.aiTokenUsage.create({
        data: {
          businessId: business.id,
          sessionId: input.sessionId ?? null,
          userId: input.userId ?? null,
          runtime: "reserved",
          messageUnits: 1
        }
      });

      return {
        usageId: usage.id,
        businessId: business.id,
        planId: business.planId,
        limit,
        used
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }
  );
}

export async function recordAiTokenUsage(input: {
  businessId: string;
  sessionId?: string | null;
  userId?: string | null;
  runtime: string;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  messageUnits?: number;
}) {
  return prisma.aiTokenUsage.create({
    data: {
      businessId: input.businessId,
      sessionId: input.sessionId ?? null,
      userId: input.userId ?? null,
      runtime: input.runtime,
      model: input.model ?? null,
      promptTokens: input.promptTokens ?? null,
      completionTokens: input.completionTokens ?? null,
      totalTokens: input.totalTokens ?? null,
      messageUnits: input.messageUnits ?? 1
    }
  });
}

export async function finalizeAiTokenUsage(input: {
  usageId: string;
  runtime: string;
  model?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
}) {
  return prisma.aiTokenUsage.update({
    where: {
      id: input.usageId
    },
    data: {
      runtime: input.runtime,
      model: input.model ?? null,
      sessionId: input.sessionId ?? null,
      userId: input.userId ?? null,
      promptTokens: input.promptTokens ?? null,
      completionTokens: input.completionTokens ?? null,
      totalTokens: input.totalTokens ?? null
    }
  });
}

export async function releaseAiTokenUsage(usageId: string) {
  return prisma.aiTokenUsage.delete({
    where: {
      id: usageId
    }
  });
}

export function buildAiQuotaExceededResponse(error: AiUsageQuotaExceededError) {
  return {
    error: error.message,
    code: "AI_QUOTA_EXCEEDED",
    limit: error.limit,
    used: error.used
  } satisfies Prisma.JsonObject;
}
