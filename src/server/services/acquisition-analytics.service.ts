import { Prisma } from "@prisma/client";

import { withSystemScope } from "@/lib/prisma";

/**
 * Platform per-channel CAC/LTV cohort reporting.
 *
 * Cross-tenant by design — runs inside `withSystemScope` so the RLS
 * `*_system_scope` policies (migration 0044) allow reads across every business.
 * Acquisition channel comes from `Business.acquisitionSource` (UTM-derived at
 * onboarding; falls back to "direct"); revenue/LTV from paid `BusinessInvoice`
 * rows; spend/CAC from the platform `AdSpend` table. All amounts are whole Rand.
 *
 * Channel matching between businesses and ad spend is case-insensitive.
 */

export type ChannelCacLtvRow = {
  channel: string;
  businesses: number;
  payingBusinesses: number;
  spendZar: number;
  revenueZar: number;
  /** Cost to acquire one business on this channel (spend ÷ businesses). */
  cacZar: number | null;
  /** Cumulative paid revenue per acquired business (revenue ÷ businesses). */
  ltvZar: number;
  /** LTV ÷ CAC. null when there is no spend recorded for the channel. */
  ltvCacRatio: number | null;
};

export type CohortCell = {
  cohortMonth: string;
  channel: string;
  businesses: number;
  revenueZar: number;
};

/**
 * B2B merchant referral programme treated as its own acquisition channel. The
 * CAC numerator is the Rand credit actually granted to referrers (rewarded
 * referrals), and revenue/LTV come from the referred businesses' paid invoices.
 */
export type ReferralCacSummary = {
  referredBusinesses: number;
  payingBusinesses: number;
  rewardSpendZar: number;
  revenueZar: number;
  cacZar: number | null;
  ltvZar: number;
  ltvCacRatio: number | null;
};

export type ChannelCacLtvReport = {
  since: string;
  channels: ChannelCacLtvRow[];
  cohorts: CohortCell[];
  referral: ReferralCacSummary;
  totals: {
    businesses: number;
    payingBusinesses: number;
    spendZar: number;
    revenueZar: number;
    blendedCacZar: number | null;
    blendedLtvZar: number;
    blendedLtvCacRatio: number | null;
  };
};

type ChannelAggRow = {
  channel: string;
  businesses: bigint;
  paying_businesses: bigint;
  revenue_zar: bigint;
};

type SpendAggRow = {
  channel: string;
  spend_zar: bigint;
};

type CohortAggRow = {
  cohort_month: string;
  channel: string;
  businesses: bigint;
  revenue_zar: bigint;
};

type ReferralAggRow = {
  referred: bigint;
  paying: bigint;
  revenue_zar: bigint;
  reward_spend_zar: bigint;
};

const DEFAULT_MONTHS = 12;

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/**
 * Build the per-channel CAC/LTV report over the trailing `months` window.
 * Businesses are bucketed by acquisition channel; the window filters on the
 * business creation date so a cohort is the set of merchants acquired in it.
 */
export async function getChannelCacLtv(months: number = DEFAULT_MONTHS): Promise<ChannelCacLtvReport> {
  const safeMonths = Number.isFinite(months) && months > 0 ? Math.min(Math.floor(months), 60) : DEFAULT_MONTHS;
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - safeMonths);
  since.setUTCHours(0, 0, 0, 0);

  return withSystemScope(async (tx) => {
    const [channelRows, spendRows, cohortRows, referralRows] = await Promise.all([
      tx.$queryRaw<ChannelAggRow[]>(Prisma.sql`
        SELECT
          COALESCE(NULLIF(b."acquisitionSource", ''), 'direct') AS channel,
          COUNT(*)::bigint AS businesses,
          COUNT(*) FILTER (WHERE rev.revenue_zar > 0)::bigint AS paying_businesses,
          COALESCE(SUM(rev.revenue_zar), 0)::bigint AS revenue_zar
        FROM "Business" b
        LEFT JOIN (
          SELECT "businessId", SUM("amountZar") AS revenue_zar
          FROM "BusinessInvoice"
          WHERE status = 'PAID'
          GROUP BY "businessId"
        ) rev ON rev."businessId" = b.id
        WHERE b."deletedAt" IS NULL AND b."createdAt" >= ${since}
        GROUP BY 1
        ORDER BY businesses DESC, channel ASC
      `),
      tx.$queryRaw<SpendAggRow[]>(Prisma.sql`
        SELECT LOWER(channel) AS channel, COALESCE(SUM("amountZar"), 0)::bigint AS spend_zar
        FROM "AdSpend"
        WHERE "periodEnd" >= ${since}
        GROUP BY LOWER(channel)
      `),
      tx.$queryRaw<CohortAggRow[]>(Prisma.sql`
        SELECT
          to_char(date_trunc('month', b."createdAt"), 'YYYY-MM') AS cohort_month,
          COALESCE(NULLIF(b."acquisitionSource", ''), 'direct') AS channel,
          COUNT(*)::bigint AS businesses,
          COALESCE(SUM(rev.revenue_zar), 0)::bigint AS revenue_zar
        FROM "Business" b
        LEFT JOIN (
          SELECT "businessId", SUM("amountZar") AS revenue_zar
          FROM "BusinessInvoice"
          WHERE status = 'PAID'
          GROUP BY "businessId"
        ) rev ON rev."businessId" = b.id
        WHERE b."deletedAt" IS NULL AND b."createdAt" >= ${since}
        GROUP BY 1, 2
        ORDER BY 1 DESC, businesses DESC
      `),
      tx.$queryRaw<ReferralAggRow[]>(Prisma.sql`
        SELECT
          COUNT(*)::bigint AS referred,
          COUNT(*) FILTER (WHERE rev.revenue_zar > 0)::bigint AS paying,
          COALESCE(SUM(rev.revenue_zar), 0)::bigint AS revenue_zar,
          COALESCE(SUM(mr."rewardAmountZar") FILTER (WHERE mr.status = 'REWARDED'), 0)::bigint AS reward_spend_zar
        FROM "MerchantReferral" mr
        JOIN "Business" b ON b.id = mr."referredBusinessId" AND b."deletedAt" IS NULL
        LEFT JOIN (
          SELECT "businessId", SUM("amountZar") AS revenue_zar
          FROM "BusinessInvoice"
          WHERE status = 'PAID'
          GROUP BY "businessId"
        ) rev ON rev."businessId" = b.id
        WHERE b."createdAt" >= ${since}
      `)
    ]);

    const spendByChannel = new Map<string, number>();
    for (const row of spendRows) {
      spendByChannel.set(row.channel, Number(row.spend_zar));
    }

    const channels: ChannelCacLtvRow[] = channelRows.map((row) => {
      const businesses = Number(row.businesses);
      const revenueZar = Number(row.revenue_zar);
      const spendZar = spendByChannel.get(row.channel.toLowerCase()) ?? 0;
      const cacZar = spendZar > 0 ? ratio(spendZar, businesses) : null;
      const ltvZar = businesses > 0 ? revenueZar / businesses : 0;
      return {
        channel: row.channel,
        businesses,
        payingBusinesses: Number(row.paying_businesses),
        spendZar,
        revenueZar,
        cacZar,
        ltvZar,
        ltvCacRatio: cacZar && cacZar > 0 ? ltvZar / cacZar : null
      };
    });

    const cohorts: CohortCell[] = cohortRows.map((row) => ({
      cohortMonth: row.cohort_month,
      channel: row.channel,
      businesses: Number(row.businesses),
      revenueZar: Number(row.revenue_zar)
    }));

    const referralAgg = referralRows[0];
    const referredBusinesses = Number(referralAgg?.referred ?? 0);
    const referralRevenue = Number(referralAgg?.revenue_zar ?? 0);
    const referralRewardSpend = Number(referralAgg?.reward_spend_zar ?? 0);
    const referralCac = referralRewardSpend > 0 ? ratio(referralRewardSpend, referredBusinesses) : null;
    const referralLtv = referredBusinesses > 0 ? referralRevenue / referredBusinesses : 0;
    const referral: ReferralCacSummary = {
      referredBusinesses,
      payingBusinesses: Number(referralAgg?.paying ?? 0),
      rewardSpendZar: referralRewardSpend,
      revenueZar: referralRevenue,
      cacZar: referralCac,
      ltvZar: referralLtv,
      ltvCacRatio: referralCac && referralCac > 0 ? referralLtv / referralCac : null
    };

    const totalBusinesses = channels.reduce((sum, c) => sum + c.businesses, 0);
    const totalPaying = channels.reduce((sum, c) => sum + c.payingBusinesses, 0);
    const totalRevenue = channels.reduce((sum, c) => sum + c.revenueZar, 0);
    // Spend is summed across all recorded channels in the window, including any
    // channels with no acquired businesses, so blended CAC is not understated.
    const totalSpend = [...spendByChannel.values()].reduce((sum, v) => sum + v, 0);
    const blendedCac = totalSpend > 0 ? ratio(totalSpend, totalBusinesses) : null;
    const blendedLtv = totalBusinesses > 0 ? totalRevenue / totalBusinesses : 0;

    return {
      since: since.toISOString(),
      channels,
      cohorts,
      referral,
      totals: {
        businesses: totalBusinesses,
        payingBusinesses: totalPaying,
        spendZar: totalSpend,
        revenueZar: totalRevenue,
        blendedCacZar: blendedCac,
        blendedLtvZar: blendedLtv,
        blendedLtvCacRatio: blendedCac && blendedCac > 0 ? blendedLtv / blendedCac : null
      }
    };
  });
}
