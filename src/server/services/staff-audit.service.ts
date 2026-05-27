import { Prisma } from "@prisma/client";

import { prisma, type PrismaTransactionClient } from "@/lib/prisma";

type AuditClient = typeof prisma | PrismaTransactionClient;

type RecordStaffAuditLogInput = {
  businessId: string;
  actorUserId: string | null | undefined;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
};

function getAuditClient(tx?: PrismaTransactionClient): AuditClient {
  return tx ?? prisma;
}

export async function recordStaffAuditLog(
  input: RecordStaffAuditLogInput,
  tx?: PrismaTransactionClient
) {
  return getAuditClient(tx).staffAuditLog.create({
    data: {
      businessId: input.businessId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined
    }
  });
}
