import { TransactionType } from "@prisma/client";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export type PromotionSuggestion = {
  name: string;
  type: "FLASH_SALE" | "DISCOUNT" | "BONUS_POINTS";
  description: string;
  reason: string;
};

/**
 * Analyzes redemption and transaction patterns to generate data-driven
 * promotion suggestions tailored to the business.
 *
 * The algorithm is intentionally deterministic (no LLM call) so it works
 * offline and returns instantly. Suggestions are based on:
 *  - Recent redemption volume (90-day window)
 *  - Active promotion gaps (missing types the business isn't running)
 *  - Earn rate (30-day window)
 */
export async function generatePromotionSuggestions(
  businessId: string
): Promise<PromotionSuggestion[]> {
  const [topRedemptions, recentEarnings, activePromotions] = await Promise.all([
    prisma.loyaltyTransaction.findMany({
      where: {
        membership: { businessId },
        type: TransactionType.REDEEM,
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
      },
      select: {
        pointsDelta: true,
        createdAt: true,
        membership: {
          select: { tier: { select: { name: true } } }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.loyaltyTransaction.findMany({
      where: {
        membership: { businessId },
        type: TransactionType.EARN,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      },
      select: {
        pointsDelta: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.promotion.findMany({
      where: {
        businessId,
        isActive: true,
        endsAt: { gte: new Date() }
      },
      select: { title: true, type: true },
      take: 10
    })
  ]);

  const suggestions: PromotionSuggestion[] = [];

  const totalRedeemed = topRedemptions.reduce(
    (sum, t) => sum + Math.abs(t.pointsDelta),
    0
  );
  const avgRedeemed =
    topRedemptions.length > 0 ? totalRedeemed / topRedemptions.length : 0;

  const totalEarned30d = recentEarnings.reduce(
    (sum, t) => sum + t.pointsDelta,
    0
  );
  const dailyAvgEarned =
    recentEarnings.length > 0
      ? totalEarned30d /
        Math.max(1, Math.ceil(recentEarnings.length / 30))
      : 0;

  const existingTypes = new Set(activePromotions.map((p) => p.type));
  const hasNoFlashSale = !existingTypes.has("FLASH_SALE");
  const hasNoBonusPoints = !existingTypes.has("BONUS_POINTS");

  if (hasNoFlashSale && avgRedeemed > 50) {
    suggestions.push({
      name: "Weekend Flash Sale",
      type: "FLASH_SALE",
      description: `Offer ${Math.round(avgRedeemed * 0.2)} bonus points for redemptions this weekend.`,
      reason: `Average redemption of ${Math.round(avgRedeemed)} points suggests customers are engaged and a flash sale could boost traffic.`
    });
  }

  if (hasNoBonusPoints && dailyAvgEarned > 0) {
    suggestions.push({
      name: "Double Points Day",
      type: "BONUS_POINTS",
      description: `Award ${Math.round(dailyAvgEarned * 2)} bonus points on the next purchase.`,
      reason: `Daily average of ${Math.round(dailyAvgEarned)} points earned indicates opportunity to boost with a multiplier.`
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      name: "Welcome Back Bonus",
      type: "BONUS_POINTS",
      description:
        "Award 50 bonus points to customers who have not visited in 14 days.",
      reason:
        "Re-engagement campaigns are consistently effective for loyalty programs."
    });
  }

  logger.info(
    {
      businessId,
      suggestionCount: suggestions.length,
      avgRedeemed: Math.round(avgRedeemed),
      dailyAvgEarned: Math.round(dailyAvgEarned)
    },
    "promotion.ai.suggested"
  );

  return suggestions;
}
