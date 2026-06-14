import {
  Prisma,
  type BusinessPlanId,
  type PaymentProvider,
} from "@prisma/client";

import { getBusinessPlan } from "@/lib/billing";
import { logger } from "@/lib/logger";
import { withBusinessScope } from "@/lib/prisma";
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
    metadata?: { businessId?: string; planId?: string };
    id?: string;
    status?: string;
    amount?: number;
  };
}): NormalizedPaymentEvent | null {
  const meta = payload.payload?.metadata;
  const businessId = meta?.businessId;
  const planId = meta?.planId;

  if (!businessId || !isPaidPlanId(planId)) {
    logger.warn({ type: payload.type }, "yoco.webhook.missing_metadata");
    return null;
  }

  if (payload.type === "payment.succeeded") {
    return {
      provider: "YOCO",
      type: "payment_succeeded",
      businessId,
      planId,
      providerPaymentId: payload.payload.id,
      providerSubscriptionId: payload.payload.id,
      amountZar:
        typeof payload.payload.amount === "number"
          ? payload.payload.amount / 100
          : undefined,
    };
  }

  if (payload.type === "payment.failed") {
    return {
      provider: "YOCO",
      type: "payment_failed",
      businessId,
      planId,
      providerPaymentId: payload.payload.id,
    };
  }

  if (payload.type === "subscription.cancelled") {
    return {
      provider: "YOCO",
      type: "subscription_cancelled",
      businessId,
      planId,
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
  const expected = getBusinessPlan(event.planId).monthlyPriceZar;
  if (Number(event.amountZar.toFixed(2)) !== expected) {
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

    assertPaidEventAmount(event);

    const plan = getBusinessPlan(event.planId);
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

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

          await tx.businessInvoice.create({
            data: {
              businessId: event.businessId,
              planId: event.planId,
              amountZar: plan.monthlyPriceZar,
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

          await tx.businessSubscription.updateMany({
            where: {
              businessId: event.businessId,
              status: { in: ["ACTIVE", "TRIALING"] },
            },
            data: { status: "CANCELLED" },
          });
          await tx.business.update({
            where: { id: event.businessId },
            data: { planId: event.planId },
          });
          await tx.businessSubscription.create({
            data: {
              businessId: event.businessId,
              planId: event.planId,
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
                planId: event.planId,
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
    metadata?: { businessId?: string; planId?: string };
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
