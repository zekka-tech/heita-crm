import { withBusinessScope, type PrismaTransactionClient } from "@/lib/prisma";

/**
 * Per-business Rand account credit earned through the B2B merchant referral loop.
 * The ledger is append-only: positive entries are credit earned, negative
 * entries are credit applied to an invoice. Balance is their sum. The table is
 * RLS-protected, so reads/writes go through a business or system scope.
 */

// Always leave at least R1 to charge so external providers accept the payment.
const MIN_CHARGE_ZAR = 1;

async function sumBalance(tx: PrismaTransactionClient, businessId: string): Promise<number> {
  const agg = await tx.merchantCreditLedger.aggregate({
    where: { businessId },
    _sum: { amountZar: true }
  });
  return agg._sum.amountZar ?? 0;
}

export async function getMerchantCreditBalance(businessId: string): Promise<number> {
  return withBusinessScope(businessId, (tx) => sumBalance(tx, businessId));
}

export async function listMerchantCreditEntries(businessId: string, limit: number = 50) {
  const take = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;
  return withBusinessScope(businessId, (tx) =>
    tx.merchantCreditLedger.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take
    })
  );
}

/**
 * How much credit can be applied to a charge of `planPriceZar` — capped at the
 * available balance and at `planPriceZar - MIN_CHARGE_ZAR` so the external
 * charge stays positive. Returns 0 (never throws) so a failure can never block
 * checkout; the credit simply rolls over to the next invoice.
 */
export async function computeApplicableCredit(businessId: string, planPriceZar: number): Promise<number> {
  try {
    const balance = await getMerchantCreditBalance(businessId);
    const maxApplicable = Math.max(0, planPriceZar - MIN_CHARGE_ZAR);
    return Math.max(0, Math.min(balance, maxApplicable));
  } catch {
    return 0;
  }
}

/**
 * Consume credit for a paid invoice inside an already-open business-scoped
 * transaction (the billing webhook). Clamps to the live balance so a rare
 * double-checkout race can never drive the balance negative. Returns the amount
 * actually applied.
 */
export async function consumeMerchantCredit(
  tx: PrismaTransactionClient,
  input: { businessId: string; requestedZar: number; invoiceId: string }
): Promise<number> {
  if (input.requestedZar <= 0) return 0;
  const balance = await sumBalance(tx, input.businessId);
  const applied = Math.min(input.requestedZar, Math.max(0, balance));
  if (applied <= 0) return 0;

  await tx.merchantCreditLedger.create({
    data: {
      businessId: input.businessId,
      amountZar: -applied,
      type: "INVOICE_APPLIED",
      description: "Credit applied to invoice.",
      invoiceId: input.invoiceId
    }
  });
  return applied;
}
