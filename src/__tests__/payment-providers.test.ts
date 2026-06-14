import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPayFastSignature,
  payfastGateway,
} from "@/server/services/payments/payfast";
import { stripeGateway } from "@/server/services/payments/stripe";
import { getConfiguredProviders } from "@/server/services/payments/registry";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function payfastRawBody(overrides: Record<string, string> = {}) {
  const fields: Record<string, string> = {
    m_payment_id: "merchant-payment-1",
    pf_payment_id: "pf-payment-1",
    payment_status: "COMPLETE",
    amount_gross: "1499.00",
    custom_str1: "biz1",
    custom_str2: "GROWTH",
    ...overrides,
  };
  fields.signature = createPayFastSignature(fields, "secret-passphrase");
  return new URLSearchParams(fields).toString();
}

describe("payment provider registry", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.YOCO_SECRET_KEY;
    delete process.env.YOCO_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.PAYFAST_MERCHANT_ID;
    delete process.env.PAYFAST_MERCHANT_KEY;
  });

  it("returns only configured providers", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.PAYFAST_MERCHANT_ID = "10000100";
    process.env.PAYFAST_MERCHANT_KEY = "merchant-key";

    expect(getConfiguredProviders()).toEqual([
      { id: "STRIPE", label: "Stripe" },
      { id: "PAYFAST", label: "PayFast" },
    ]);
  });
});

function signedStripeRequest(payload: string, secret = "whsec_test") {
  return new Request("https://app.test/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "stripe-signature": Stripe.webhooks.generateTestHeaderString({
        payload,
        secret,
      }),
      "Content-Type": "application/json",
    },
    body: payload,
  });
}

describe("Stripe gateway", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
    };
  });

  it("normalizes paid checkout sessions", async () => {
    const payload = JSON.stringify({
      id: "evt_checkout_paid",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          object: "checkout.session",
          payment_status: "paid",
          currency: "zar",
          amount_total: 149900,
          payment_intent: "pi_test_123",
          customer: "cus_test_123",
          metadata: { businessId: "biz1", planId: "GROWTH" },
        },
      },
    });

    const event = await stripeGateway.verifyAndParseWebhook(
      signedStripeRequest(payload),
      payload,
    );

    expect(event).toMatchObject({
      provider: "STRIPE",
      type: "payment_succeeded",
      businessId: "biz1",
      planId: "GROWTH",
      providerPaymentId: "pi_test_123",
      providerCustomerId: "cus_test_123",
      amountZar: 1499,
    });
  });

  it("normalizes Starter checkout sessions at the Starter price", async () => {
    const payload = JSON.stringify({
      id: "evt_checkout_starter_paid",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_starter",
          object: "checkout.session",
          payment_status: "paid",
          currency: "zar",
          amount_total: 49900,
          payment_intent: "pi_test_starter",
          metadata: { businessId: "biz1", planId: "STARTER" },
        },
      },
    });

    const event = await stripeGateway.verifyAndParseWebhook(
      signedStripeRequest(payload),
      payload,
    );

    expect(event).toMatchObject({
      provider: "STRIPE",
      type: "payment_succeeded",
      businessId: "biz1",
      planId: "STARTER",
      amountZar: 499,
    });
  });

  it("ignores completed checkout sessions that are not paid", async () => {
    const payload = JSON.stringify({
      id: "evt_checkout_unpaid",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          object: "checkout.session",
          payment_status: "unpaid",
          currency: "zar",
          amount_total: 149900,
          metadata: { businessId: "biz1", planId: "GROWTH" },
        },
      },
    });

    await expect(
      stripeGateway.verifyAndParseWebhook(
        signedStripeRequest(payload),
        payload,
      ),
    ).resolves.toBeNull();
  });

  it("rejects invalid Stripe signatures", async () => {
    const payload = JSON.stringify({
      id: "evt_bad",
      object: "event",
      type: "checkout.session.completed",
    });
    const request = new Request("https://app.test/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "bad-signature" },
      body: payload,
    });

    await expect(
      stripeGateway.verifyAndParseWebhook(request, payload),
    ).rejects.toThrow(/signature/i);
  });
});

describe("PayFast gateway", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      PAYFAST_MERCHANT_ID: "10000100",
      PAYFAST_MERCHANT_KEY: "merchant-key",
      PAYFAST_PASSPHRASE: "secret-passphrase",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("VALID")));
  });

  it("creates a signed form-post checkout", async () => {
    const result = await payfastGateway.createCheckout({
      businessId: "biz1",
      planId: "GROWTH",
      returnUrl: "https://app.test/dashboard/biz1/settings/billing",
    });

    expect(result.kind).toBe("form_post");
    if (result.kind === "form_post") {
      expect(result.url).toContain("sandbox.payfast.co.za");
      expect(result.fields.custom_str1).toBe("biz1");
      expect(result.fields.custom_str2).toBe("GROWTH");
      expect(result.fields.signature).toBe(
        createPayFastSignature(result.fields, "secret-passphrase"),
      );
    }
  });

  it("creates a signed Starter form-post checkout", async () => {
    const result = await payfastGateway.createCheckout({
      businessId: "biz1",
      planId: "STARTER",
      returnUrl: "https://app.test/dashboard/biz1/settings/billing",
    });

    expect(result.kind).toBe("form_post");
    if (result.kind === "form_post") {
      expect(result.fields.amount).toBe("499.00");
      expect(result.fields.custom_str2).toBe("STARTER");
      expect(result.fields.signature).toBe(
        createPayFastSignature(result.fields, "secret-passphrase"),
      );
    }
  });

  it("accepts a valid Starter ITN after signature, postback, and amount validation", async () => {
    const event = await payfastGateway.verifyAndParseWebhook(
      new Request("https://app.test/api/webhooks/payfast", { method: "POST" }),
      payfastRawBody({ amount_gross: "499.00", custom_str2: "STARTER" }),
    );

    expect(event).toMatchObject({
      provider: "PAYFAST",
      type: "payment_succeeded",
      businessId: "biz1",
      planId: "STARTER",
      providerPaymentId: "pf-payment-1",
    });
  });

  it("accepts a valid ITN after signature, postback, and amount validation", async () => {
    const event = await payfastGateway.verifyAndParseWebhook(
      new Request("https://app.test/api/webhooks/payfast", { method: "POST" }),
      payfastRawBody(),
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/eng/query/validate"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(event).toMatchObject({
      provider: "PAYFAST",
      type: "payment_succeeded",
      businessId: "biz1",
      planId: "GROWTH",
      providerPaymentId: "pf-payment-1",
    });
  });

  it("rejects an ITN with a mismatched amount", async () => {
    await expect(
      payfastGateway.verifyAndParseWebhook(
        new Request("https://app.test/api/webhooks/payfast", {
          method: "POST",
        }),
        payfastRawBody({ amount_gross: "1.00" }),
      ),
    ).rejects.toThrow(/amount/i);
  });

  it("rejects an ITN when PayFast postback is not VALID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("INVALID")));

    await expect(
      payfastGateway.verifyAndParseWebhook(
        new Request("https://app.test/api/webhooks/payfast", {
          method: "POST",
        }),
        payfastRawBody(),
      ),
    ).rejects.toThrow(/postback/i);
  });
});
