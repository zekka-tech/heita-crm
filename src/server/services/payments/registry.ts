import type { PaymentProvider } from "@prisma/client";

import type { PaymentGateway } from "@/server/services/payments/gateway";
import type { ConfiguredPaymentProvider } from "@/server/services/payments/types";
import { payfastGateway } from "@/server/services/payments/payfast";
import { stripeGateway } from "@/server/services/payments/stripe";
import { yocoGateway } from "@/server/services/payments/yoco";

const gateways = [yocoGateway, stripeGateway, payfastGateway] satisfies PaymentGateway[];

export function getGateway(provider: PaymentProvider): PaymentGateway {
  const gateway = gateways.find((candidate) => candidate.id === provider);
  if (!gateway) throw new Error(`Unsupported payment provider: ${provider}`);
  return gateway;
}

export function getConfiguredProviders(): ConfiguredPaymentProvider[] {
  return gateways
    .filter((gateway) => gateway.isConfigured())
    .map((gateway) => ({ id: gateway.id, label: gateway.label }));
}

export function isConfiguredProvider(provider: PaymentProvider): boolean {
  return getGateway(provider).isConfigured();
}
