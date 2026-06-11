import crypto from "node:crypto";

import { getBusinessPlan } from "@/lib/billing";
import { logger } from "@/lib/logger";
import { constantTimeEqual } from "@/lib/security";
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
        metadata?: { businessId?: string; planId?: string };
      };
    };
  } catch {
    throw new PaymentWebhookError("Invalid JSON.", 400);
  }
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

    const amountCents = plan.monthlyPriceZar * 100;
    const monthStamp = new Date().toISOString().slice(0, 7);
    const idempotencyKey = `checkout:${input.businessId}:${input.planId}:${monthStamp}`;

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
        metadata: { businessId: input.businessId, planId: input.planId },
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
    const businessId = payload.payload?.metadata?.businessId;
    const planId = payload.payload?.metadata?.planId;
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
        providerPaymentId: payload.payload?.id,
        providerSubscriptionId: payload.payload?.id,
        amountZar:
          typeof payload.payload?.amount === "number"
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
        providerPaymentId: payload.payload?.id,
      };
    }
    if (payload.type === "subscription.cancelled") {
      return {
        provider: "YOCO",
        type: "subscription_cancelled",
        businessId,
        planId,
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
