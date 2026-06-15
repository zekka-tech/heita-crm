import { withSystemScope } from "@/lib/prisma";
import { logger } from "@/lib/logger";

type AnonymisedBasketRow = {
  period: string;
  province: string;
  category: string;
  totalTransactions: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  avgTransactionValue: number;
};

export async function generateAnonymisedBasketReport(
  days: number = 90
): Promise<AnonymisedBasketRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const transactions = await withSystemScope((tx) =>
    tx.loyaltyTransaction.findMany({
      where: {
        createdAt: { gte: since },
        type: { in: ["EARN", "REDEEM"] }
      },
      select: {
        type: true,
        pointsDelta: true,
        createdAt: true,
        membership: {
          select: {
            business: {
              select: {
                province: true,
                category: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    })
  );

  const buckets = new Map<string, {
    province: string;
    category: string;
    totalTransactions: number;
    totalPointsEarned: number;
    totalPointsRedeemed: number;
  }>();

  for (const tx of transactions) {
    const week = tx.createdAt.toISOString().slice(0, 7);
    const province = tx.membership.business.province;
    const category = tx.membership.business.category;
    const key = `${week}|${province}|${category}`;

    const existing = buckets.get(key);
    if (existing) {
      existing.totalTransactions++;
      if (tx.type === "EARN") existing.totalPointsEarned += tx.pointsDelta;
      if (tx.type === "REDEEM") existing.totalPointsRedeemed += Math.abs(tx.pointsDelta);
    } else {
      buckets.set(key, {
        province,
        category,
        totalTransactions: 1,
        totalPointsEarned: tx.type === "EARN" ? tx.pointsDelta : 0,
        totalPointsRedeemed: tx.type === "REDEEM" ? Math.abs(tx.pointsDelta) : 0
      });
    }
  }

  return Array.from(buckets.entries()).map(([key, data]) => ({
    period: key.split("|")[0] ?? "",
    province: data.province,
    category: data.category,
    totalTransactions: data.totalTransactions,
    totalPointsEarned: data.totalPointsEarned,
    totalPointsRedeemed: data.totalPointsRedeemed,
    avgTransactionValue: data.totalTransactions > 0
      ? Math.round((data.totalPointsEarned + data.totalPointsRedeemed) / data.totalTransactions)
      : 0
  }));
}

export async function sendBasketReport() {
  const report = await generateAnonymisedBasketReport();
  logger.info(
    { rows: report.length, periodDays: 90 },
    "analytics.basket_report.generated"
  );
  return report;
}
