import { Prisma } from "@prisma/client";

import { getBusinessPlan } from "@/lib/billing";
import { prisma, withBusinessScope, type PrismaTransactionClient } from "@/lib/prisma";

export class AiUsageQuotaExceededError extends Error {
  constructor(
    readonly businessId: string,
    readonly limit: number,
    readonly used: number,
    readonly overageAllowed: boolean = false,
    readonly overagePriceZar: number = 0
  ) {
    super("AI quota exceeded for the current billing period.");
    this.name = "AiUsageQuotaExceededError";
  }
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function setBusinessScope(
  tx: PrismaTransactionClient,
  businessId: string
) {
  await tx.$executeRaw`SELECT set_config('app.current_business_id', ${businessId}, true)`;
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

export async function checkAiMessageAllowance(businessId: string) {
  try {
    const result = await assertAiMessageQuotaAvailable({ businessId });
    return { allowed: true, limit: result.limit, used: result.used, overageAllowed: false, overagePriceZar: 0 };
  } catch (err) {
    if (err instanceof AiUsageQuotaExceededError) {
      return {
        allowed: false,
        limit: err.limit,
        used: err.used,
        overageAllowed: false,
        overagePriceZar: 0
      };
    }
    throw err;
  }
}

export async function assertAiMessageQuotaAvailable(input: {
  businessId: string;
}) {
  return withBusinessScope(input.businessId, async (tx) => {
    const business = await tx.business.findUniqueOrThrow({
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
  });
}

export async function reserveAiMessageQuota(input: {
  businessId: string;
  sessionId?: string | null;
  userId?: string | null;
}) {
  return prisma.$transaction(
    async (tx) => {
      await setBusinessScope(tx, input.businessId);

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
          messageUnits: 1,
          isOverage: false
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
  return withBusinessScope(input.businessId, (tx) =>
    tx.aiTokenUsage.create({
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
    })
  );
}

export async function finalizeAiTokenUsage(input: {
  businessId: string;
  usageId: string;
  runtime: string;
  model?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheCreationTokens?: number | null;
}) {
  return withBusinessScope(input.businessId, (tx) =>
    tx.aiTokenUsage.update({
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
        totalTokens: input.totalTokens ?? null,
        cacheReadTokens: input.cacheReadTokens ?? null,
        cacheCreationTokens: input.cacheCreationTokens ?? null
      }
    })
  );
}

export async function releaseAiTokenUsage(input: {
  businessId: string;
  usageId: string;
}) {
  return withBusinessScope(input.businessId, (tx) =>
    tx.aiTokenUsage.delete({
      where: {
        id: input.usageId
      }
    })
  );
}

export function buildAiQuotaExceededResponse(error: AiUsageQuotaExceededError) {
  return {
    error: error.message,
    code: "AI_QUOTA_EXCEEDED",
    limit: error.limit,
    used: error.used,
    overageAllowed: false,
    overagePriceZar: 0
  } satisfies Prisma.JsonObject;
}
