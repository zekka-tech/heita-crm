import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AuditClient = PrismaClient | Prisma.TransactionClient;

type RecordStaffAuditLogInput = {
  businessId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
};

function getAuditClient(tx?: Prisma.TransactionClient): AuditClient {
  return tx ?? prisma;
}

export async function recordStaffAuditLog(
  input: RecordStaffAuditLogInput,
  tx?: Prisma.TransactionClient
) {
  return getAuditClient(tx).staffAuditLog.create({
    data: {
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined
    }
  });
}
