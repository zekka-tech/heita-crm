import type { MessagePackGroup } from "@prisma/client";

import { logger } from "@/lib/logger";
import { withBusinessScope, type PrismaTransactionClient } from "@/lib/prisma";
import { getReachPackSku } from "@/lib/reach-packs";
import type { MessageQuotaGroup } from "@/server/services/message-usage.service";

/**
 * Reach-pack commerce — granting and tallying purchased outbound-message volume.
 *
 * Packs raise a business's effective monthly allowance for a quota group (read
 * by `message-usage.service`). V1 payment method is the existing merchant
 * account-credit ledger (so referral credit is spendable on reach) — external
 * one-off checkout is a follow-up. All access is business-scoped (RLS).
 */

export class ReachPackError extends Error {}

/** Map the Prisma pack-group enum to the meter's quota-group string. */
export function packGroupToQuotaGroup(group: MessagePackGroup): Extract<MessageQuotaGroup, "whatsapp" | "in_app"> {
  return group === "WHATSAPP" ? "whatsapp" : "in_app";
}

/**
 * Sum non-expired pack units per quota group, using a caller-provided scoped
 * transaction. Exposed so the meter can include packs in the same query path
 * without opening a nested transaction.
 */
export async function sumActivePackUnits(
  tx: PrismaTransactionClient,
  businessId: string,
  now: Date = new Date()
): Promise<Record<"whatsapp" | "in_app", number>> {
  const rows = await tx.messagePack.groupBy({
    by: ["group"],
    where: { businessId, expiresAt: { gt: now } },
    _sum: { units: true }
  });
  const totals: Record<"whatsapp" | "in_app", number> = { whatsapp: 0, in_app: 0 };
  for (const row of rows) {
    totals[packGroupToQuotaGroup(row.group)] = row._sum.units ?? 0;
  }
  return totals;
}

/** Active (non-expired) pack units per quota group for effective-limit maths. */
export async function getActivePackUnits(
  businessId: string
): Promise<Record<"whatsapp" | "in_app", number>> {
  return withBusinessScope(businessId, (tx) => sumActivePackUnits(tx, businessId));
}

/**
 * Grant a reach-pack from a confirmed external payment (money checkout webhook).
 * Idempotent: a repeat webhook delivery for the same `providerPaymentId` is a
 * no-op (the payment id is stored on `MessagePack.invoiceId`). Validates the
 * charged amount against the SKU price. Returns the granted pack, or null when
 * the SKU is unknown, the amount mismatches, or the payment was already applied.
 */
export async function grantReachPackFromPayment(input: {
  businessId: string;
  packId: string;
  providerPaymentId: string;
  amountZar?: number;
}) {
  const sku = getReachPackSku(input.packId);
  if (!sku) {
    logger.warn({ packId: input.packId, businessId: input.businessId }, "reach_pack.payment.unknown_sku");
    return null;
  }
  if (typeof input.amountZar === "number" && Math.round(input.amountZar) !== sku.priceZar) {
    logger.warn(
      { packId: input.packId, expected: sku.priceZar, received: input.amountZar },
      "reach_pack.payment.amount_mismatch"
    );
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + sku.validDays * 24 * 60 * 60 * 1000);

  return withBusinessScope(input.businessId, async (tx) => {
    const existing = await tx.messagePack.findFirst({
      where: { businessId: input.businessId, invoiceId: input.providerPaymentId },
      select: { id: true }
    });
    if (existing) {
      logger.info(
        { businessId: input.businessId, providerPaymentId: input.providerPaymentId },
        "reach_pack.payment.duplicate_ignored"
      );
      return null;
    }

    return tx.messagePack.create({
      data: {
        businessId: input.businessId,
        group: sku.group,
        units: sku.units,
        source: "PURCHASE",
        invoiceId: input.providerPaymentId,
        expiresAt
      }
    });
  });
}

export async function listActiveReachPacks(businessId: string) {
  const now = new Date();
  return withBusinessScope(businessId, (tx) =>
    tx.messagePack.findMany({
      where: { businessId, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" }
    })
  );
}

/**
 * Buy a reach-pack with merchant account credit: atomically debit the credit
 * ledger and grant the pack. Throws ReachPackError on unknown SKU or
 * insufficient credit. Runs in one business-scoped transaction so the debit and
 * grant cannot diverge.
 */
export async function purchaseReachPackWithCredit(input: {
  businessId: string;
  packId: string;
}) {
  const sku = getReachPackSku(input.packId);
  if (!sku) {
    throw new ReachPackError("Unknown reach-pack.");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + sku.validDays * 24 * 60 * 60 * 1000);

  return withBusinessScope(input.businessId, async (tx) => {
    const balanceAgg = await tx.merchantCreditLedger.aggregate({
      where: { businessId: input.businessId },
      _sum: { amountZar: true }
    });
    const balance = balanceAgg._sum.amountZar ?? 0;
    if (balance < sku.priceZar) {
      throw new ReachPackError(
        `Insufficient account credit. This pack costs R${sku.priceZar}; balance is R${balance}.`
      );
    }

    await tx.merchantCreditLedger.create({
      data: {
        businessId: input.businessId,
        amountZar: -sku.priceZar,
        type: "REACH_PACK",
        description: `Reach-pack: ${sku.label}`
      }
    });

    const pack = await tx.messagePack.create({
      data: {
        businessId: input.businessId,
        group: sku.group,
        units: sku.units,
        source: "CREDIT",
        expiresAt
      }
    });

    return { pack, priceZar: sku.priceZar, remainingCreditZar: balance - sku.priceZar };
  });
}
