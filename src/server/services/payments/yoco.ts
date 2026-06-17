import crypto from "node:crypto";

import { getBusinessPlan } from "@/lib/billing";
import { logger } from "@/lib/logger";
import { constantTimeEqual } from "@/lib/security";
import { computeApplicableCredit } from "@/server/services/merchant-credit.service";
import {
  PaymentWebhookError,
  type PaymentGateway,
} from "@/server/services/payments/gateway";
import type {
  CheckoutResult,
  CreateCheckoutInput,
  NormalizedPaymentEvent,
} from "@/server/services/payments/types";
import { isPaidPlanId } from "@/server/services/payments/types";

function parseYocoPayload(rawBody: string) {
  try {
    return JSON.parse(rawBody) as {
      type?: string;
      payload?: {
        id?: string;
        status?: string;
        amount?: number;
        metadata?: {
          businessId?: string;
          planId?: string;
          appliedCreditZar?: string;
          kind?: string;
          packId?: string;
        };
      };
    };
  } catch {
    throw new PaymentWebhookError("Invalid JSON.", 400);
  }
}

/**
 * One-off reach-pack checkout (money, not account credit). Charges the SKU price
 * and round-trips `kind=reach_pack` + `packId` via metadata so the webhook can
 * grant the pack instead of activating a subscription.
 */
export async function createYocoReachPackCheckout(input: {
  businessId: string;
  packId: string;
  priceZar: number;
  returnUrl: string;
}): Promise<CheckoutResult> {
  const yocoKey = process.env.YOCO_SECRET_KEY;
  if (!yocoKey) throw new Error("YOCO_SECRET_KEY not configured.");
  if (input.priceZar <= 0) throw new Error("Reach-pack price must be positive.");

  const resp = await fetch("https://payments.yoco.com/api/checkouts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${yocoKey}`,
      "Idempotency-Key": `reachpack:${input.businessId}:${input.packId}:${Date.now()}`,
    },
    body: JSON.stringify({
      amount: input.priceZar * 100,
      currency: "ZAR",
      metadata: { businessId: input.businessId, packId: input.packId, kind: "reach_pack" },
      successUrl: `${input.returnUrl}?reachpack=success`,
      cancelUrl: `${input.returnUrl}?reachpack=cancelled`,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    logger.error(
      { businessId: input.businessId, packId: input.packId, status: resp.status, body },
      "yoco.reachpack_checkout.failed",
    );
    throw new Error(`Yoco reach-pack checkout failed: ${resp.status}`);
  }

  const data = (await resp.json()) as { id: string; redirectUrl: string };
  return { kind: "redirect", checkoutId: data.id, url: data.redirectUrl };
}

export const yocoGateway: PaymentGateway = {
  id: "YOCO",
  label: "Yoco",
  isConfigured() {
    return Boolean(
      process.env.YOCO_SECRET_KEY && process.env.YOCO_WEBHOOK_SECRET,
    );
  },
  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const plan = getBusinessPlan(input.planId);
    if (plan.monthlyPriceZar === 0) {
      throw new Error("Cannot create a checkout session for the Free plan.");
    }

    const yocoKey = process.env.YOCO_SECRET_KEY;
    if (!yocoKey) throw new Error("YOCO_SECRET_KEY not configured.");

    // Apply available merchant referral credit to reduce the charge. Fails open
    // to 0 (full charge) so credit can never block checkout.
    const appliedCreditZar = await computeApplicableCredit(
      input.businessId,
      plan.monthlyPriceZar,
    );
    const chargeZar = plan.monthlyPriceZar - appliedCreditZar;
    const amountCents = chargeZar * 100;
    const monthStamp = new Date().toISOString().slice(0, 7);
    const idempotencyKey = `checkout:${input.businessId}:${input.planId}:${monthStamp}:${appliedCreditZar}`;

    const resp = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${yocoKey}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        amount: amountCents,
        currency: "ZAR",
        metadata: {
          businessId: input.businessId,
          planId: input.planId,
          appliedCreditZar: String(appliedCreditZar),
        },
        successUrl: `${input.returnUrl}?checkout=success&plan=${input.planId}`,
        cancelUrl: `${input.returnUrl}?checkout=cancelled`,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const body = await resp.text();
      logger.error(
        {
          businessId: input.businessId,
          planId: input.planId,
          status: resp.status,
          body,
        },
        "yoco.checkout.failed",
      );
      throw new Error(`Yoco checkout failed: ${resp.status}`);
    }

    const data = (await resp.json()) as { id: string; redirectUrl: string };
    return { kind: "redirect", checkoutId: data.id, url: data.redirectUrl };
  },
  async verifyAndParseWebhook(
    request: Request,
    rawBody: string,
  ): Promise<NormalizedPaymentEvent | null> {
    const signature = request.headers.get("x-yoco-signature");
    if (!signature) throw new PaymentWebhookError("Missing signature.");

    const secret = process.env.YOCO_WEBHOOK_SECRET;
    if (!secret) {
      logger.error({}, "yoco.webhook.no_secret");
      throw new PaymentWebhookError("Webhook secret not configured.", 500);
    }

    const timestampHeader = request.headers.get("x-yoco-timestamp");
    if (!timestampHeader) {
      throw new PaymentWebhookError("Missing timestamp.");
    }
    const ts = Number(timestampHeader);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
      logger.warn(
        { timestamp: timestampHeader },
        "yoco.webhook.replay_detected",
      );
      throw new PaymentWebhookError("Request timestamp out of range.");
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    if (!constantTimeEqual(signature, expected)) {
      logger.warn({}, "yoco.webhook.invalid_signature");
      throw new PaymentWebhookError("Invalid signature.");
    }

    const payload = parseYocoPayload(rawBody);
    const meta = payload.payload?.metadata;
    const businessId = meta?.businessId;
    const isReachPack = meta?.kind === "reach_pack";
    const planId = meta?.planId;
    if (!businessId || (isReachPack ? !meta?.packId : !isPaidPlanId(planId))) {
      logger.warn({ type: payload.type }, "yoco.webhook.missing_metadata");
      return null;
    }
    const appliedCreditZar = Number(meta?.appliedCreditZar ?? 0);
    const amountZar = typeof payload.payload?.amount === "number" ? payload.payload.amount / 100 : undefined;

    if (payload.type === "payment.succeeded" && isReachPack) {
      return {
        provider: "YOCO",
        type: "payment_succeeded",
        businessId,
        kind: "reach_pack",
        packId: meta?.packId,
        providerPaymentId: payload.payload?.id,
        amountZar,
      };
    }

    if (payload.type === "payment.succeeded") {
      return {
        provider: "YOCO",
        type: "payment_succeeded",
        businessId,
        planId: planId as NormalizedPaymentEvent["planId"],
        providerPaymentId: payload.payload?.id,
        providerSubscriptionId: payload.payload?.id,
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
        providerPaymentId: payload.payload?.id,
      };
    }
    if (payload.type === "subscription.cancelled") {
      return {
        provider: "YOCO",
        type: "subscription_cancelled",
        businessId,
        planId: planId as NormalizedPaymentEvent["planId"],
        providerSubscriptionId: payload.payload?.id,
      };
    }

    logger.debug(
      { type: payload.type, businessId },
      "yoco.webhook.unhandled_event",
    );
    return null;
  },
};
