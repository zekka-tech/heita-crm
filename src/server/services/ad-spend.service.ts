import { withSystemScope } from "@/lib/prisma";

/**
 * Platform marketing-spend records that feed the CAC numerator in
 * {@link getChannelCacLtv}. `AdSpend` is not tenant-scoped; all access goes
 * through `withSystemScope` so it shares one RLS-authorised path with the rest
 * of the cross-tenant reporting. Amounts are whole Rand.
 */

export type AdSpendInput = {
  channel: string;
  periodStart: Date;
  periodEnd: Date;
  amountZar: number;
  note?: string | null;
};

export class AdSpendValidationError extends Error {}

function normaliseChannel(channel: string): string {
  return channel.trim().toLowerCase();
}

/**
 * Upsert a spend record for a (channel, period) — recording the same channel and
 * period again overwrites the amount rather than double-counting.
 */
export async function recordAdSpend(input: AdSpendInput) {
  const channel = normaliseChannel(input.channel);
  if (!channel) {
    throw new AdSpendValidationError("Channel is required.");
  }
  if (!Number.isInteger(input.amountZar) || input.amountZar < 0) {
    throw new AdSpendValidationError("Amount must be a non-negative whole number of Rand.");
  }
  if (!(input.periodStart instanceof Date) || Number.isNaN(input.periodStart.getTime())) {
    throw new AdSpendValidationError("Period start is invalid.");
  }
  if (!(input.periodEnd instanceof Date) || Number.isNaN(input.periodEnd.getTime())) {
    throw new AdSpendValidationError("Period end is invalid.");
  }
  if (input.periodEnd < input.periodStart) {
    throw new AdSpendValidationError("Period end must not be before period start.");
  }

  return withSystemScope((tx) =>
    tx.adSpend.upsert({
      where: {
        channel_periodStart_periodEnd: {
          channel,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd
        }
      },
      create: {
        channel,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        amountZar: input.amountZar,
        note: input.note?.trim() || null
      },
      update: {
        amountZar: input.amountZar,
        note: input.note?.trim() || null
      }
    })
  );
}

export async function listAdSpend(limit: number = 50) {
  const take = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;
  return withSystemScope((tx) =>
    tx.adSpend.findMany({
      orderBy: [{ periodStart: "desc" }, { channel: "asc" }],
      take
    })
  );
}
