import { MessageChannel } from "@prisma/client";

import { getPlanQuota } from "@/lib/billing";
import { withBusinessScope, type PrismaTransactionClient } from "@/lib/prisma";
import { sumActivePackUnits } from "@/server/services/reach-pack.service";

/**
 * Outbound-message metering — the foundation reach-packs build on.
 *
 * Plan quotas (`maxWaTemplatesPerMonth`, `maxInAppMessagesPerMonth`) were
 * previously metadata only. This service makes them *measured*: it counts
 * outbound `Message` rows for the current calendar month per quota group and
 * compares them to the plan allowance. The `Message` table is the single source
 * of truth — every send chokepoint (`channel-dispatch`, `channel-orchestrator`)
 * already persists an OUTBOUND row, and it is indexed on
 * `(businessId, channel, createdAt)`.
 *
 * This slice is measurement only — it does not yet block sends. Enforcement and
 * purchasable reach-packs (extra volume above quota) layer on top via
 * `assertOutboundMessageQuota`.
 */

export type MessageQuotaGroup = "whatsapp" | "in_app" | "unmetered";

export type ChannelUsage = {
  group: MessageQuotaGroup;
  used: number;
  limit: number | null; // null = unlimited / unmetered
  remaining: number | null;
  exceeded: boolean;
};

export type MessageUsageReport = {
  periodStart: string;
  whatsapp: ChannelUsage;
  inApp: ChannelUsage;
};

export class MessageQuotaExceededError extends Error {
  constructor(
    public readonly businessId: string,
    public readonly group: MessageQuotaGroup,
    public readonly limit: number,
    public readonly used: number
  ) {
    super(`Outbound message quota exceeded for ${group} (${used}/${limit}).`);
    this.name = "MessageQuotaExceededError";
  }
}

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Map a delivery channel to the plan-quota group it draws down. */
export function quotaGroupForChannel(channel: MessageChannel): MessageQuotaGroup {
  if (channel === MessageChannel.WHATSAPP) return "whatsapp";
  if (channel === MessageChannel.IN_APP || channel === MessageChannel.PUSH) return "in_app";
  // SMS and EMAIL have no plan quota today (no reach-pack SKU yet).
  return "unmetered";
}

function limitForGroup(planId: string, group: MessageQuotaGroup): number | null {
  const quota = getPlanQuota(planId);
  if (group === "whatsapp") return quota.maxWaTemplatesPerMonth;
  if (group === "in_app") return quota.maxInAppMessagesPerMonth;
  return null;
}

async function countOutboundByGroup(
  tx: PrismaTransactionClient,
  businessId: string,
  since: Date
): Promise<Record<MessageQuotaGroup, number>> {
  const rows = await tx.message.groupBy({
    by: ["channel"],
    where: { businessId, direction: "OUTBOUND", createdAt: { gte: since } },
    _count: { _all: true }
  });

  const counts: Record<MessageQuotaGroup, number> = { whatsapp: 0, in_app: 0, unmetered: 0 };
  for (const row of rows) {
    counts[quotaGroupForChannel(row.channel)] += row._count._all;
  }
  return counts;
}

function buildChannelUsage(group: MessageQuotaGroup, used: number, limit: number | null): ChannelUsage {
  return {
    group,
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    exceeded: limit !== null && used >= limit
  };
}

/** Current-month outbound usage for the metered channel groups. */
export async function getMonthlyMessageUsage(businessId: string): Promise<MessageUsageReport> {
  const since = startOfCurrentMonth();
  return withBusinessScope(businessId, async (tx) => {
    const business = await tx.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { planId: true }
    });
    const counts = await countOutboundByGroup(tx, businessId, since);
    // Effective limit = plan quota + active reach-pack units (null = unlimited).
    const packUnits = await sumActivePackUnits(tx, businessId);
    const effectiveLimit = (group: "whatsapp" | "in_app") => {
      const planLimit = limitForGroup(business.planId, group);
      return planLimit === null ? null : planLimit + packUnits[group];
    };
    return {
      periodStart: since.toISOString(),
      whatsapp: buildChannelUsage("whatsapp", counts.whatsapp, effectiveLimit("whatsapp")),
      inApp: buildChannelUsage("in_app", counts.in_app, effectiveLimit("in_app"))
    };
  });
}

/** Allowance check for a single channel (used = current-month group usage). */
export async function checkOutboundMessageAllowance(
  businessId: string,
  channel: MessageChannel
): Promise<ChannelUsage> {
  const group = quotaGroupForChannel(channel);
  if (group === "unmetered") {
    return { group, used: 0, limit: null, remaining: null, exceeded: false };
  }
  const report = await getMonthlyMessageUsage(businessId);
  return group === "whatsapp" ? report.whatsapp : report.inApp;
}

/**
 * Enforcement primitive (not yet wired into send paths): throws
 * MessageQuotaExceededError when sending `count` more messages on `channel`
 * would exceed the plan allowance. Unmetered channels and null limits always
 * pass. Reach-packs will extend `limitForGroup` with purchased volume.
 */
export async function assertOutboundMessageQuota(input: {
  businessId: string;
  channel: MessageChannel;
  count?: number;
}): Promise<void> {
  const group = quotaGroupForChannel(input.channel);
  if (group === "unmetered") return;
  const usage = await checkOutboundMessageAllowance(input.businessId, input.channel);
  if (usage.limit === null) return;
  const count = Math.max(1, input.count ?? 1);
  if (usage.used + count > usage.limit) {
    throw new MessageQuotaExceededError(input.businessId, group, usage.limit, usage.used);
  }
}
