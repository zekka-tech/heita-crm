import Stripe from "stripe";
import { getBusinessPlan } from "@/lib/billing";
import { logger } from "@/lib/logger";
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

function stripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY not configured.");
  return new Stripe(secretKey);
}

function metadataFromObject(object: { metadata?: Stripe.Metadata | null }) {
  const businessId = object.metadata?.businessId;
  const planId = object.metadata?.planId;
  if (!businessId || !isPaidPlanId(planId)) return null;
  return { businessId, planId };
}

export const stripeGateway: PaymentGateway = {
  id: "STRIPE",
  label: "Stripe",
  isConfigured() {
    return Boolean(
      process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
    );
  },
  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const plan = getBusinessPlan(input.planId);
    if (plan.monthlyPriceZar === 0) {
      throw new Error("Cannot create a checkout session for the Free plan.");
    }

    const session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      success_url: `${input.returnUrl}?checkout=success&plan=${input.planId}`,
      cancel_url: `${input.returnUrl}?checkout=cancelled`,
      client_reference_id: input.businessId,
      metadata: { businessId: input.businessId, planId: input.planId },
      payment_intent_data: {
        metadata: { businessId: input.businessId, planId: input.planId },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "zar",
            unit_amount: plan.monthlyPriceZar * 100,
            product_data: { name: `Heita ${plan.name} monthly` },
          },
        },
      ],
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { kind: "redirect", checkoutId: session.id, url: session.url };
  },
  async verifyAndParseWebhook(
    request: Request,
    rawBody: string,
  ): Promise<NormalizedPaymentEvent | null> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret)
      throw new PaymentWebhookError("Webhook secret not configured.", 500);

    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new PaymentWebhookError("Missing signature.");

    let event: Stripe.Event;
    try {
      event = stripeClient().webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (err) {
      logger.warn({ err }, "stripe.webhook.invalid_signature");
      throw new PaymentWebhookError("Invalid signature.");
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = metadataFromObject(session);
      if (!metadata) return null;
      if (session.payment_status !== "paid") {
        logger.warn(
          { paymentStatus: session.payment_status, sessionId: session.id },
          "stripe.webhook.checkout_not_paid",
        );
        return null;
      }
      if (
        session.currency?.toLowerCase() !== "zar" ||
        typeof session.amount_total !== "number"
      ) {
        logger.warn(
          { currency: session.currency, sessionId: session.id },
          "stripe.webhook.invalid_currency_or_amount",
        );
        throw new PaymentWebhookError("Invalid Stripe amount.");
      }
      return {
        provider: "STRIPE",
        type: "payment_succeeded",
        businessId: metadata.businessId,
        planId: metadata.planId,
        providerPaymentId:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.id,
        providerSubscriptionId:
          typeof session.subscription === "string"
            ? session.subscription
            : undefined,
        providerCustomerId:
          typeof session.customer === "string" ? session.customer : undefined,
        amountZar: session.amount_total / 100,
      };
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const metadata = metadataFromObject(intent);
      if (!metadata) return null;
      return {
        provider: "STRIPE",
        type: "payment_failed",
        businessId: metadata.businessId,
        planId: metadata.planId,
        providerPaymentId: intent.id,
        providerCustomerId:
          typeof intent.customer === "string" ? intent.customer : undefined,
        amountZar:
          typeof intent.amount === "number" ? intent.amount / 100 : undefined,
      };
    }

    if (event.type === "charge.failed") {
      const charge = event.data.object as Stripe.Charge;
      const metadata = metadataFromObject(charge);
      if (!metadata) return null;
      return {
        provider: "STRIPE",
        type: "payment_failed",
        businessId: metadata.businessId,
        planId: metadata.planId,
        providerPaymentId: charge.id,
        providerCustomerId:
          typeof charge.customer === "string" ? charge.customer : undefined,
        amountZar:
          typeof charge.amount === "number" ? charge.amount / 100 : undefined,
      };
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const metadata = metadataFromObject(subscription);
      if (!metadata) return null;
      return {
        provider: "STRIPE",
        type: "subscription_cancelled",
        businessId: metadata.businessId,
        planId: metadata.planId,
        providerSubscriptionId: subscription.id,
        providerCustomerId:
          typeof subscription.customer === "string"
            ? subscription.customer
            : undefined,
      };
    }

    logger.debug({ type: event.type }, "stripe.webhook.unhandled_event");
    return null;
  },
};
