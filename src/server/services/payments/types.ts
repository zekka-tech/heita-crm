import type { BusinessPlanId, PaymentProvider } from "@prisma/client";

const PAID_PLAN_IDS = new Set<string>(["STARTER", "GROWTH", "SCALE"]);

export function isPaidPlanId(value: string | null | undefined): value is BusinessPlanId {
  return PAID_PLAN_IDS.has(value ?? "");
}

export type CheckoutResult =
  | { kind: "redirect"; url: string; checkoutId?: string }
  | { kind: "form_post"; url: string; fields: Record<string, string> };

export type CreateCheckoutInput = {
  businessId: string;
  planId: BusinessPlanId;
  returnUrl: string;
};

export type NormalizedPaymentEvent = {
  provider: PaymentProvider;
  type: "payment_succeeded" | "payment_failed" | "subscription_cancelled";
  businessId: string;
  // Present for subscription checkouts; absent for one-off reach-pack purchases.
  planId?: BusinessPlanId;
  providerPaymentId?: string;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  amountZar?: number;
  // Rand of merchant referral credit applied to this charge at checkout
  // (round-tripped via provider metadata). Reduces the expected charge amount
  // and is consumed from the ledger when the invoice is recorded.
  appliedCreditZar?: number;
  // Discriminates a one-off reach-pack purchase from a subscription payment.
  // Defaults to subscription when absent (back-compat).
  kind?: "subscription" | "reach_pack";
  // The reach-pack SKU id, present when kind === "reach_pack".
  packId?: string;
};

export type ConfiguredPaymentProvider = {
  id: PaymentProvider;
  label: string;
};
