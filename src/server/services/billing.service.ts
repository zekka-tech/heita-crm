import type { BusinessPlanId } from "@prisma/client";

import { getBusinessPlan } from "@/lib/billing";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

export type PlanLimitKey =
  | "members"
  | "staffSeats"
  | "aiMessagesPerMonth"
  | "documentUploadsPerMonth";

export async function getActiveSubscription(businessId: string) {
  return prisma.businessSubscription.findFirst({
    where: {
      businessId,
      status: { in: ["ACTIVE", "TRIALING"] }
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function getEffectivePlan(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { planId: true }
  });
  return business?.planId ?? "FREE";
}

export async function checkPlanLimit(
  businessId: string,
  key: PlanLimitKey
): Promise<{ allowed: boolean; limit: number | null; current: number }> {
  const planId = await getEffectivePlan(businessId);
  const plan = getBusinessPlan(planId);
  const limit = plan.limits[key];

  let current = 0;
  if (key === "members") {
    current = await prisma.membership.count({ where: { businessId } });
  } else if (key === "staffSeats") {
    current = await prisma.staffMember.count({ where: { businessId } });
  } else if (key === "aiMessagesPerMonth") {
    const start = startOfMonth();
    current = await prisma.aiTokenUsage.count({
      where: { businessId, createdAt: { gte: start } }
    });
  } else if (key === "documentUploadsPerMonth") {
    const start = startOfMonth();
    current = await prisma.businessDocument.count({
      where: { businessId, createdAt: { gte: start } }
    });
  }

  return { allowed: limit === null || current < limit, limit, current };
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function createYocoCheckoutSession(
  businessId: string,
  planId: BusinessPlanId,
  returnUrl: string
) {
  const plan = getBusinessPlan(planId);
  if (plan.monthlyPriceZar === 0) {
    throw new Error("Cannot create a checkout session for the Free plan.");
  }

  const yocoKey = process.env.YOCO_SECRET_KEY;
  if (!yocoKey) throw new Error("YOCO_SECRET_KEY not configured.");

  const amountCents = plan.monthlyPriceZar * 100;

  const resp = await fetch("https://payments.yoco.com/api/checkouts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${yocoKey}`
    },
    body: JSON.stringify({
      amount: amountCents,
      currency: "ZAR",
      metadata: { businessId, planId },
      successUrl: `${returnUrl}?checkout=success&plan=${planId}`,
      cancelUrl: `${returnUrl}?checkout=cancelled`
    }),
    signal: AbortSignal.timeout(15_000)
  });

  if (!resp.ok) {
    const body = await resp.text();
    logger.error({ businessId, planId, status: resp.status, body }, "yoco.checkout.failed");
    throw new Error(`Yoco checkout failed: ${resp.status}`);
  }

  const data = (await resp.json()) as { id: string; redirectUrl: string };
  return { checkoutId: data.id, redirectUrl: data.redirectUrl };
}

export async function handleYocoWebhook(payload: {
  type: string;
  payload: {
    metadata?: { businessId?: string; planId?: string };
    id?: string;
    status?: string;
  };
}) {
  const { type } = payload;
  const meta = payload.payload?.metadata;
  const businessId = meta?.businessId;
  const planId = meta?.planId as BusinessPlanId | undefined;

  if (!businessId || !planId) {
    logger.warn({ type }, "yoco.webhook.missing_metadata");
    return;
  }

  if (type === "payment.succeeded") {
    const plan = getBusinessPlan(planId);
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.$transaction(async (tx) => {
      // Idempotency: skip if this payment has already been processed.
      const existingInvoice = await tx.businessInvoice.findFirst({
        where: { yocoPaymentId: payload.payload.id }
      });
      if (existingInvoice) {
        logger.info(
          { businessId, yocoPaymentId: payload.payload.id },
          "billing.webhook.duplicate_ignored"
        );
        return;
      }

      await tx.business.update({
        where: { id: businessId },
        data: { planId }
      });
      await tx.businessSubscription.create({
        data: {
          businessId,
          planId,
          status: "ACTIVE",
          yocoSubscriptionId: payload.payload.id,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd
        }
      });
      await tx.businessInvoice.create({
        data: {
          businessId,
          planId,
          amountZar: plan.monthlyPriceZar,
          status: "PAID",
          yocoPaymentId: payload.payload.id,
          paidAt: now,
          periodStart: now,
          periodEnd
        }
      });
      await recordStaffAuditLog(
        {
          businessId,
          actorUserId: null,
          action: "BILLING_SUBSCRIPTION_ACTIVATED",
          targetType: "Business",
          targetId: businessId,
          metadata: { planId, yocoPaymentId: payload.payload.id, amountZar: plan.monthlyPriceZar }
        },
        tx
      );
    });

    logger.info({ businessId, planId }, "billing.subscription.activated");
  } else if (type === "payment.failed") {
    await prisma.businessSubscription.updateMany({
      where: { businessId, status: "ACTIVE" },
      data: { status: "PAST_DUE" }
    });
    await recordStaffAuditLog({
      businessId,
      actorUserId: null,
      action: "BILLING_PAYMENT_FAILED",
      targetType: "Business",
      targetId: businessId,
      metadata: { planId, yocoPaymentId: payload.payload.id }
    });
    logger.warn({ businessId, planId }, "billing.subscription.past_due");
  } else if (type === "subscription.cancelled") {
    await prisma.$transaction(async (tx) => {
      await tx.businessSubscription.updateMany({
        where: { businessId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
        data: { status: "CANCELLED" }
      });
      await tx.business.update({
        where: { id: businessId },
        data: { planId: "FREE" }
      });
      await recordStaffAuditLog(
        {
          businessId,
          actorUserId: null,
          action: "BILLING_SUBSCRIPTION_CANCELLED",
          targetType: "Business",
          targetId: businessId,
          metadata: { planId, yocoSubscriptionId: payload.payload.id }
        },
        tx
      );
    });
    logger.info({ businessId, planId }, "billing.subscription.cancelled");
  } else {
    logger.debug({ type, businessId }, "yoco.webhook.unhandled_event");
  }
}

export async function listInvoices(businessId: string) {
  return prisma.businessInvoice.findMany({
    where: { businessId },
    orderBy: { issuedAt: "desc" },
    take: 24
  });
}
