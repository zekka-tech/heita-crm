import { TransactionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ReceiptHistoryFilter = {
  businessSlug: string;
  userId: string;
  type?: TransactionType | "ALL";
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

export async function getReceiptHistory(input: ReceiptHistoryFilter) {
  const membership = await prisma.membership.findFirst({
    where: {
      userId: input.userId,
      isActive: true,
      business: {
        slug: input.businessSlug,
        deletedAt: null
      }
    },
    include: {
      business: true,
      tier: true
    }
  });

  if (!membership) {
    return null;
  }

  const transactions = await prisma.loyaltyTransaction.findMany({
    where: {
      membershipId: membership.id,
      ...(input.type && input.type !== "ALL" ? { type: input.type } : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            createdAt: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {})
            }
          }
        : {})
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 200
  });

  return {
    membership,
    transactions
  };
}

export function formatReceiptHistoryCsv(input: {
  businessName: string;
  transactions: Array<{
    createdAt: Date;
    type: string;
    description: string | null;
    pointsDelta: number;
    expiresAt: Date | null;
  }>;
}) {
  const rows = [
    ["business", "date", "type", "description", "pointsDelta", "expiresAt"]
  ];

  for (const transaction of input.transactions) {
    rows.push([
      input.businessName,
      transaction.createdAt.toISOString(),
      transaction.type,
      transaction.description ?? "",
      String(transaction.pointsDelta),
      transaction.expiresAt?.toISOString() ?? ""
    ]);
  }

  return `${rows
    .map((row) =>
      row
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n")}\n`;
}
