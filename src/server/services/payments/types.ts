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
  planId: BusinessPlanId;
  providerPaymentId?: string;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  amountZar?: number;
};

export type ConfiguredPaymentProvider = {
  id: PaymentProvider;
  label: string;
};
