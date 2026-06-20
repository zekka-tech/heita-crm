import {
  Prisma,
  StaffRole,
  type BusinessPlanId,
  type PaymentProvider,
} from "@prisma/client";

import { getBusinessPlan, getPlanQuota } from "@/lib/billing";
import { logger } from "@/lib/logger";
import { captureEvent } from "@/lib/telemetry";
import { TELEMETRY_EVENTS } from "@/lib/telemetry-events";
import { withBusinessScope, type PrismaTransactionClient } from "@/lib/prisma";
import { consumeMerchantCredit } from "@/server/services/merchant-credit.service";
import { grantReachPackFromPayment } from "@/server/services/reach-pack.service";
import { settleMerchantReferralForReferred } from "@/server/services/merchant-referral.service";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";
import {
  getGateway,
  isConfiguredProvider,
} from "@/server/services/payments/registry";
import type {
  CheckoutResult,
  NormalizedPaymentEvent,
} from "@/server/services/payments/types";
import { isPaidPlanId } from "@/server/services/payments/types";

export const PAID_BUSINESS_PLAN_IDS: BusinessPlanId[] = ["STARTER", "GROWTH", "SCALE"];

export const PAST_DUE_GRACE_DAYS = 3;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isPastDueGraceActive(
  subscription: { status: string; updatedAt: Date },
  now = new Date(),
) {
  return (
    subscription.status === "PAST_DUE" &&
    now < addDays(subscription.updatedAt, PAST_DUE_GRACE_DAYS)
  );
}

export function isPaidBusinessPlan(
  planId: BusinessPlanId | string | null | undefined,
): planId is BusinessPlanId {
  return planId === "STARTER" || planId === "GROWTH" || planId === "SCALE";
}

export async function requirePaidBusinessPlan(
  businessId: string,
  featureName = "This feature",
) {
  const planId = await getEffectivePlan(businessId);
  if (!isPaidBusinessPlan(planId)) {
    throw new Error(
      featureName +
        " is available on paid plans only. Upgrade to Starter, Growth, or Scale to use it.",
    );
  }
  return planId;
}

export type PlanLimitKey =
  | "members"
  | "staffSeats"
  | "aiMessagesPerMonth"
  | "documentUploadsPerMonth";

export async function getActiveSubscription(businessId: string) {
  return withBusinessScope(businessId, (tx) => {
    return tx.businessSubscription.findFirst({
      where: {
        businessId,
        status: { in: ["ACTIVE", "TRIALING"] },
      },
      orderBy: { createdAt: "desc" },
    });
  });
}

export async function getEffectivePlan(businessId: string) {
  const business = await withBusinessScope(businessId, (tx) => {
    return tx.business.findUnique({
      where: { id: businessId },
      select: { planId: true },
    });
  });
  const planId = business?.planId ?? "FREE";
  // Non-paid plans are unaffected by subscription state.
  if (!isPaidBusinessPlan(planId)) return planId;
  // A paid planId only grants access while billing is in good standing. Past-due
  // subscriptions get a short recovery window to avoid cutting off paying
  // customers for transient payment failures. Cancelled and expired past-due
  // subscriptions fail closed to FREE without waiting for a planId downgrade.
  // A paid planId with no subscription row at all (e.g. an admin/seed grant) is
  // trusted as-is.
  const latestSub = await withBusinessScope(businessId, (tx) => {
    return tx.businessSubscription.findFirst({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      select: { status: true, updatedAt: true },
    });
  });
  if (latestSub?.status === "CANCELLED") {
    return "FREE";
  }
  if (
    latestSub &&
    latestSub.status === "PAST_DUE" &&
    !isPastDueGraceActive(latestSub)
  ) {
    return "FREE";
  }
  return planId;
}

export async function checkPlanLimit(
  businessId: string,
  key: PlanLimitKey,
): Promise<{ allowed: boolean; limit: number | null; current: number }> {
  const planId = await getEffectivePlan(businessId);
  const plan = getBusinessPlan(planId);
  const limit = plan.limits[key];

  let current = 0;
  if (key === "members") {
    current = await withBusinessScope(businessId, (tx) => {
      return tx.membership.count({ where: { businessId } });
    });
  } else if (key === "staffSeats") {
    current = await withBusinessScope(businessId, (tx) => {
      return tx.staffMember.count({ where: { businessId } });
    });
  } else if (key === "aiMessagesPerMonth") {
    const start = startOfMonth();
    current = await withBusinessScope(businessId, (tx) => {
      return tx.aiTokenUsage.count({
        where: { businessId, createdAt: { gte: start } },
      });
    });
  } else if (key === "documentUploadsPerMonth") {
    const start = startOfMonth();
    current = await withBusinessScope(businessId, (tx) => {
      return tx.businessDocument.count({
        where: { businessId, createdAt: { gte: start } },
      });
    });
  }

  return { allowed: limit === null || current < limit, limit, current };
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isUniqueConstraintError(err: unknown) {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

type SubscriptionTelemetry =
  | {
      event: typeof TELEMETRY_EVENTS.subscriptionStarted;
      userId: string;
      properties: {
        businessId: string;
        plan: BusinessPlanId;
        billingInterval: "monthly" | "annual";
      };
    }
  | {
      event: typeof TELEMETRY_EVENTS.subscriptionUpgraded;
      userId: string;
      properties: {
        businessId: string;
        previousPlan: BusinessPlanId;
        newPlan: BusinessPlanId;
        billingInterval: "monthly" | "annual";
      };
    };

async function buildSubscriptionTelemetry(
  tx: Pick<PrismaTransactionClient, "business" | "staffMember">,
  event: NormalizedPaymentEvent,
): Promise<SubscriptionTelemetry | null> {
  // Subscription telemetry only applies to plan payments (reach-pack purchases
  // carry no planId).
  if (!event.planId) return null;
  const newPlan = event.planId;
  const previousBusiness = await tx.business.findUnique({
    where: { id: event.businessId },
    select: { planId: true },
  });
  const previousPlan = previousBusiness?.planId ?? "FREE";

  if (previousPlan === newPlan) {
    return null;
  }

  const owner = await tx.staffMember.findFirst({
    where: { businessId: event.businessId, role: StaffRole.OWNER },
    select: { userId: true },
    orderBy: { joinedAt: "asc" },
  });

  if (!owner?.userId) {
    return null;
  }

  if (previousPlan === "FREE") {
    return {
      event: TELEMETRY_EVENTS.subscriptionStarted,
      userId: owner.userId,
      properties: {
        businessId: event.businessId,
        plan: newPlan,
        billingInterval: "monthly",
      },
    };
  }

  if (isPaidBusinessPlan(previousPlan)) {
    return {
      event: TELEMETRY_EVENTS.subscriptionUpgraded,
      userId: owner.userId,
      properties: {
        businessId: event.businessId,
        previousPlan,
        newPlan: newPlan,
        billingInterval: "monthly",
      },
    };
  }

  return null;
}

export async function createCheckout(
  businessId: string,
  planId: BusinessPlanId,
  returnUrl: string,
  provider: PaymentProvider,
): Promise<CheckoutResult> {
  const plan = getBusinessPlan(planId);
  if (plan.monthlyPriceZar === 0) {
    throw new Error("Cannot create a checkout session for the Free plan.");
  }

  if (!isConfiguredProvider(provider)) {
    throw new Error(`Payment provider ${provider} is not configured.`);
  }

  return getGateway(provider).createCheckout({ businessId, planId, returnUrl });
}

export async function createYocoCheckoutSession(
  businessId: string,
  planId: BusinessPlanId,
  returnUrl: string,
) {
  const result = await createCheckout(businessId, planId, returnUrl, "YOCO");
  if (result.kind !== "redirect") {
    throw new Error("Yoco checkout did not return a redirect URL.");
  }
  return { checkoutId: result.checkoutId, redirectUrl: result.url };
}

function normalizeLegacyYocoWebhook(payload: {
  type: string;
  payload: {
    metadata?: { businessId?: string; planId?: string; appliedCreditZar?: string; kind?: string; packId?: string };
    id?: string;
    status?: string;
    amount?: number;
  };
}): NormalizedPaymentEvent | null {
  const meta = payload.payload?.metadata;
  const businessId = meta?.businessId;
  const planId = meta?.planId;
  const isReachPack = meta?.kind === "reach_pack";

  // Reach-pack purchases carry a packId instead of a plan; subscription events
  // must have a valid paid plan.
  if (!businessId || (isReachPack ? !meta?.packId : !isPaidPlanId(planId))) {
    logger.warn({ type: payload.type }, "yoco.webhook.missing_metadata");
    return null;
  }

  const appliedCreditZar = Number(meta?.appliedCreditZar ?? 0);
  const amountZar = typeof payload.payload.amount === "number" ? payload.payload.amount / 100 : undefined;

  if (payload.type === "payment.succeeded" && isReachPack) {
    return {
      provider: "YOCO",
      type: "payment_succeeded",
      businessId,
      kind: "reach_pack",
      packId: meta?.packId,
      providerPaymentId: payload.payload.id,
      amountZar,
    };
  }

  if (payload.type === "payment.succeeded") {
    return {
      provider: "YOCO",
      type: "payment_succeeded",
      businessId,
      planId: planId as NormalizedPaymentEvent["planId"],
      providerPaymentId: payload.payload.id,
      providerSubscriptionId: payload.payload.id,
      amountZar,
      appliedCreditZar: Number.isFinite(appliedCreditZar) ? appliedCreditZar : 0,
    };
  }

  if (payload.type === "payment.failed") {
    return {
      provider: "YOCO",
      type: "payment_failed",
      businessId,
      planId: planId as NormalizedPaymentEvent["planId"],
      providerPaymentId: payload.payload.id,
    };
  }

  if (payload.type === "subscription.cancelled") {
    return {
      provider: "YOCO",
      type: "subscription_cancelled",
      businessId,
      planId: planId as NormalizedPaymentEvent["planId"],
      providerSubscriptionId: payload.payload.id,
    };
  }

  logger.debug(
    { type: payload.type, businessId },
    "yoco.webhook.unhandled_event",
  );
  return null;
}

function assertPaidEventAmount(event: NormalizedPaymentEvent) {
  if (event.amountZar === undefined) return;
  // Merchant referral credit legitimately reduces the charged amount; the
  // expected charge is the plan price net of credit applied at checkout.
  const appliedCredit = Math.max(0, event.appliedCreditZar ?? 0);
  const expected = getBusinessPlan(event.planId).monthlyPriceZar - appliedCredit;
  if (Math.round(event.amountZar * 100) !== Math.round(expected * 100)) {
    logger.warn(
      {
        businessId: event.businessId,
        planId: event.planId,
        provider: event.provider,
        expected,
        received: event.amountZar,
      },
      "billing.webhook.amount_mismatch",
    );
    throw new Error("Payment amount does not match selected plan.");
  }
}

export async function applyPaymentEvent(event: NormalizedPaymentEvent | null) {
  if (!event) return;

  if (event.type === "payment_succeeded") {
    if (!event.providerPaymentId) {
      logger.warn(
        { businessId: event.businessId, provider: event.provider },
        "billing.webhook.missing_payment_id",
      );
      return;
    }

    // One-off reach-pack purchase (money checkout): grant volume and stop —
    // this is not a subscription payment, so it skips invoice/subscription logic.
    if (event.kind === "reach_pack") {
      if (!event.packId) {
        logger.warn({ businessId: event.businessId, provider: event.provider }, "billing.webhook.reach_pack.missing_pack_id");
        return;
      }
      await grantReachPackFromPayment({
        businessId: event.businessId,
        packId: event.packId,
        providerPaymentId: event.providerPaymentId,
        amountZar: event.amountZar,
      });
      return;
    }

    if (!event.planId) {
      logger.warn({ businessId: event.businessId, provider: event.provider }, "billing.webhook.missing_plan_id");
      return;
    }
    // Capture the narrowed plan id; TS loses the guard's narrowing inside the
    // withBusinessScope async closure below.
    const planId = event.planId;

    assertPaidEventAmount(event);

    const plan = getBusinessPlan(planId);
    const appliedCredit = Math.max(0, event.appliedCreditZar ?? 0);
    const netAmountZar = Math.max(0, plan.monthlyPriceZar - appliedCredit);
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    let subscriptionTelemetry: SubscriptionTelemetry | null = null;

    try {
      await withBusinessScope(event.businessId, async (tx) => {
          const existingInvoice = await tx.businessInvoice.findFirst({
            where: {
              provider: event.provider,
              providerPaymentId: event.providerPaymentId,
            },
          });
          if (existingInvoice) {
            logger.info(
              {
                businessId: event.businessId,
                provider: event.provider,
                providerPaymentId: event.providerPaymentId,
              },
              "billing.webhook.duplicate_ignored",
            );
            return;
          }

          subscriptionTelemetry = await buildSubscriptionTelemetry(tx, event);

          const invoice = await tx.businessInvoice.create({
            data: {
              businessId: event.businessId,
              planId: planId,
              amountZar: netAmountZar,
              status: "PAID",
              provider: event.provider,
              providerPaymentId: event.providerPaymentId,
              yocoPaymentId:
                event.provider === "YOCO" ? event.providerPaymentId : undefined,
              paidAt: now,
              periodStart: now,
              periodEnd,
            },
          });

          // Consume any merchant referral credit applied to this charge. Runs in
          // the same business scope and is guarded by the duplicate-invoice check
          // above, so it is recorded exactly once per payment.
          if (appliedCredit > 0) {
            await consumeMerchantCredit(tx, {
              businessId: event.businessId,
              requestedZar: appliedCredit,
              invoiceId: invoice.id,
            });
          }

          await tx.businessSubscription.updateMany({
            where: {
              businessId: event.businessId,
              status: { in: ["ACTIVE", "TRIALING"] },
            },
            data: { status: "CANCELLED" },
          });
          await tx.business.update({
            where: { id: event.businessId },
            data: { planId: planId },
          });
          await tx.businessSubscription.create({
            data: {
              businessId: event.businessId,
              planId: planId,
              status: "ACTIVE",
              provider: event.provider,
              providerCustomerId: event.providerCustomerId,
              providerSubscriptionId: event.providerSubscriptionId,
              yocoCustomerId:
                event.provider === "YOCO"
                  ? event.providerCustomerId
                  : undefined,
              yocoSubscriptionId:
                event.provider === "YOCO"
                  ? event.providerSubscriptionId
                  : undefined,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
            },
          });
          await recordStaffAuditLog(
            {
              businessId: event.businessId,
              actorUserId: null,
              action: "BILLING_SUBSCRIPTION_ACTIVATED",
              targetType: "Business",
              targetId: event.businessId,
              metadata: {
                planId: planId,
                provider: event.provider,
                providerPaymentId: event.providerPaymentId,
                amountZar: plan.monthlyPriceZar,
              },
            },
            tx,
          );
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        logger.info(
          {
            businessId: event.businessId,
            provider: event.provider,
            providerPaymentId: event.providerPaymentId,
          },
          "billing.webhook.duplicate_ignored",
        );
        return;
      }
      throw err;
    }

    if (subscriptionTelemetry) {
      captureEvent(subscriptionTelemetry);
    }

    // Settle any pending B2B merchant referral now that this business has paid.
    // Cross-tenant (credits the referrer) and idempotent, so it runs after the
    // payment transaction commits and never blocks activation on failure.
    try {
      await settleMerchantReferralForReferred(event.businessId);
    } catch (settleErr) {
      logger.error(
        { businessId: event.businessId, err: settleErr },
        "merchant_referral.settle_failed",
      );
    }

    logger.info(
      {
        businessId: event.businessId,
        planId: event.planId,
        provider: event.provider,
      },
      "billing.subscription.activated",
    );
    return;
  }

  if (event.type === "payment_failed") {
    await withBusinessScope(event.businessId, async (tx) => {
        await tx.businessSubscription.updateMany({
          where: {
            businessId: event.businessId,
            provider: event.provider,
            status: "ACTIVE",
            ...(event.providerSubscriptionId
              ? { providerSubscriptionId: event.providerSubscriptionId }
              : {}),
          },
          data: { status: "PAST_DUE" },
        });
        await recordStaffAuditLog(
          {
            businessId: event.businessId,
            actorUserId: null,
            action: "BILLING_PAYMENT_FAILED",
            targetType: "Business",
            targetId: event.businessId,
            metadata: {
              planId: event.planId,
              provider: event.provider,
              providerPaymentId: event.providerPaymentId,
            },
          },
          tx,
        );
    });
    logger.warn(
      {
        businessId: event.businessId,
        planId: event.planId,
        provider: event.provider,
      },
      "billing.subscription.past_due",
    );
    return;
  }

  if (event.type === "subscription_cancelled") {
    if (!event.providerSubscriptionId) {
      logger.warn(
        { businessId: event.businessId, provider: event.provider },
        "billing.webhook.missing_subscription_id",
      );
      return;
    }

    await withBusinessScope(event.businessId, async (tx) => {
        const cancelled = await tx.businessSubscription.updateMany({
          where: {
            businessId: event.businessId,
            provider: event.provider,
            providerSubscriptionId: event.providerSubscriptionId,
            status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
          },
          data: { status: "CANCELLED" },
        });
        if (cancelled.count === 0) {
          logger.warn(
            {
              businessId: event.businessId,
              provider: event.provider,
              providerSubscriptionId: event.providerSubscriptionId,
            },
            "billing.webhook.stale_cancellation_ignored",
          );
          return;
        }
        await tx.business.update({
          where: { id: event.businessId },
          data: { planId: "FREE" },
        });
        await recordStaffAuditLog(
          {
            businessId: event.businessId,
            actorUserId: null,
            action: "BILLING_SUBSCRIPTION_CANCELLED",
            targetType: "Business",
            targetId: event.businessId,
            metadata: {
              planId: event.planId,
              provider: event.provider,
              providerSubscriptionId: event.providerSubscriptionId,
            },
          },
          tx,
        );
    });
    logger.info(
      {
        businessId: event.businessId,
        planId: event.planId,
        provider: event.provider,
      },
      "billing.subscription.cancelled",
    );
  }
}

export async function handleYocoWebhook(payload: {
  type: string;
  payload: {
    metadata?: { businessId?: string; planId?: string; appliedCreditZar?: string; kind?: string; packId?: string };
    id?: string;
    status?: string;
    amount?: number;
  };
}) {
  await applyPaymentEvent(normalizeLegacyYocoWebhook(payload));
}

export async function listInvoices(businessId: string) {
  return withBusinessScope(businessId, (tx) => {
    return tx.businessInvoice.findMany({
      where: { businessId },
      orderBy: { issuedAt: "desc" },
      take: 24,
    });
  });
}

/**
 * Bill overage charges for AI messages consumed beyond the plan limit.
 * Only applies to paid plans (STARTER, GROWTH, SCALE) with aiOveragePriceZar > 0.
 * Creates a PENDING invoice for the total overage charges this month.
 *
 * NOTE: Schema currently uses BusinessPlanId enum (no "OVERAGE" value) and
 * PaymentProvider enum (no "MANUAL" value). The invoice uses the effective
 * plan ID and defaults provider to YOCO. A future migration should add
 * OVERAGE/MANUAL enum values for cleaner invoice categorization.
 */
export async function billAiOverageCharges(businessId: string) {
  return withBusinessScope(businessId, async (tx) => {
    const planId = await getEffectivePlan(businessId);
    const planQuota = getPlanQuota(planId);
    if (!planQuota || planQuota.aiOveragePriceZar <= 0) return null;

    const monthStart = startOfMonth();

    // Sum all isOverage=true usage this month
    const overageCount = await tx.aiTokenUsage.count({
      where: {
        businessId,
        isOverage: true,
        createdAt: { gte: monthStart }
      }
    });

    if (overageCount === 0) return null;

    const amountZar = Math.round(
      overageCount * planQuota.aiOveragePriceZar
    );

    if (amountZar <= 0) return null;

    // Guard against duplicate invoices from back-to-back cron runs.
    const existing = await tx.businessInvoice.findFirst({
      where: { businessId, status: "PENDING", periodStart: monthStart },
      select: { id: true }
    });
    if (existing) {
      return { overageCount, amountZar, invoiceId: existing.id };
    }

    // Create an invoice for overage charges.
    // provider defaults to YOCO per schema; planId uses effective plan
    // since the Prisma enum does not currently include "OVERAGE".
    const invoice = await tx.businessInvoice.create({
      data: {
        businessId,
        planId,
        amountZar,
        status: "PENDING",
        periodStart: monthStart,
        periodEnd: new Date()
      }
    });

    return { overageCount, amountZar, invoiceId: invoice.id };
  });
}
