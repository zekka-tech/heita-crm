import { z } from "zod";

const TierPerksSchema = z.object({
  pointMultiplier: z.number().min(1).max(5).optional(),
  freeDelivery: z.boolean().optional(),
  exclusiveAccess: z.boolean().optional()
});

export type TierPerks = z.infer<typeof TierPerksSchema>;

export function getTierPerks(input: unknown): TierPerks {
  const parsed = TierPerksSchema.safeParse(input);
  return parsed.success ? parsed.data : {};
}

export function getTierPointMultiplier(input: unknown) {
  return getTierPerks(input).pointMultiplier ?? 1;
}

export function applyTierPointMultiplier(input: {
  basePoints: number;
  perks: unknown;
}) {
  const multiplier = getTierPointMultiplier(input.perks);
  return Math.max(1, Math.round(input.basePoints * multiplier));
}

export function describeTierPerks(input: unknown) {
  const perks = getTierPerks(input);
  const labels: string[] = [];

  if (perks.pointMultiplier && perks.pointMultiplier > 1) {
    labels.push(`${perks.pointMultiplier.toFixed(2).replace(/\.00$/, "")}x points`);
  }
  if (perks.freeDelivery) {
    labels.push("Free delivery");
  }
  if (perks.exclusiveAccess) {
    labels.push("Exclusive access");
  }

  return labels;
}

export function calculatePointsExpiryDate(input: {
  issuedAt?: Date;
  expiryDays: number | null | undefined;
}) {
  const expiryDays = input.expiryDays ?? 0;
  if (!Number.isFinite(expiryDays) || expiryDays <= 0) {
    return null;
  }

  const issuedAt = input.issuedAt ?? new Date();
  return new Date(issuedAt.getTime() + expiryDays * 24 * 60 * 60 * 1000);
}
