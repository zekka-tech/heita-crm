import type { PaymentProvider } from "@prisma/client";

import type { CheckoutResult, CreateCheckoutInput, NormalizedPaymentEvent } from "@/server/services/payments/types";

export class PaymentWebhookError extends Error {
  constructor(message: string, public readonly status = 401) {
    super(message);
    this.name = "PaymentWebhookError";
  }
}

export interface PaymentGateway {
  id: PaymentProvider;
  label: string;
  isConfigured(): boolean;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  verifyAndParseWebhook(request: Request, rawBody: string): Promise<NormalizedPaymentEvent | null>;
}
