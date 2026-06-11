import crypto from "node:crypto";
import { lookup } from "node:dns/promises";

import type { BusinessPlanId } from "@prisma/client";

import { getBusinessPlan } from "@/lib/billing";
import { logger } from "@/lib/logger";
import { constantTimeEqual, getClientIp } from "@/lib/security";
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

const PAYFAST_HOSTS = [
  "www.payfast.co.za",
  "sandbox.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
];

function mode() {
  return process.env.PAYFAST_MODE === "live" ? "live" : "sandbox";
}

function processUrl() {
  return mode() === "live"
    ? "https://www.payfast.co.za/eng/process"
    : "https://sandbox.payfast.co.za/eng/process";
}

function validateUrl() {
  return mode() === "live"
    ? "https://www.payfast.co.za/eng/query/validate"
    : "https://sandbox.payfast.co.za/eng/query/validate";
}

function encodePayFast(value: string) {
  return encodeURIComponent(value.trim()).replace(/%20/g, "+");
}

function signatureBase(fields: Record<string, string>, passphrase?: string) {
  const params = Object.entries(fields)
    .filter(([key, value]) => key !== "signature" && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${encodePayFast(value)}`);

  if (passphrase) params.push(`passphrase=${encodePayFast(passphrase)}`);
  return params.join("&");
}

export function createPayFastSignature(
  fields: Record<string, string>,
  passphrase = process.env.PAYFAST_PASSPHRASE,
) {
  return crypto
    .createHash("md5")
    .update(signatureBase(fields, passphrase))
    .digest("hex");
}

async function isAllowedPayFastSource(request: Request) {
  if (process.env.NODE_ENV !== "production") return true;

  const clientIp = getClientIp(request.headers);
  try {
    const records = await Promise.all(
      PAYFAST_HOSTS.map((host) => lookup(host, { all: true }).catch(() => [])),
    );
    return records.flat().some((record) => record.address === clientIp);
  } catch (err) {
    logger.warn({ err, clientIp }, "payfast.webhook.ip_resolution_failed");
    return false;
  }
}

async function validatePayFastPostback(rawBody: string) {
  const response = await fetch(validateUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: rawBody,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return false;
  const body = (await response.text()).trim();
  return body === "VALID";
}

function parseForm(rawBody: string) {
  const params = new URLSearchParams(rawBody);
  const fields: Record<string, string> = {};
  for (const [key, value] of params.entries()) fields[key] = value;
  return fields;
}

function assertAmountMatches(
  fields: Record<string, string>,
  planId: BusinessPlanId,
) {
  const expected = getBusinessPlan(planId).monthlyPriceZar.toFixed(2);
  const received = Number(fields.amount_gross).toFixed(2);
  if (received !== expected) {
    logger.warn(
      { expected, received, planId },
      "payfast.webhook.amount_mismatch",
    );
    throw new PaymentWebhookError("Amount mismatch.");
  }
}

export const payfastGateway: PaymentGateway = {
  id: "PAYFAST",
  label: "PayFast",
  isConfigured() {
    return Boolean(
      process.env.PAYFAST_MERCHANT_ID && process.env.PAYFAST_MERCHANT_KEY,
    );
  },
  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const merchantId = process.env.PAYFAST_MERCHANT_ID;
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
    if (!merchantId || !merchantKey)
      throw new Error("PayFast merchant credentials not configured.");

    const plan = getBusinessPlan(input.planId);
    if (plan.monthlyPriceZar === 0) {
      throw new Error("Cannot create a checkout session for the Free plan.");
    }

    const fields: Record<string, string> = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: `${input.returnUrl}?checkout=success&plan=${input.planId}`,
      cancel_url: `${input.returnUrl}?checkout=cancelled`,
      notify_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/webhooks/payfast`,
      m_payment_id: crypto.randomUUID(),
      amount: plan.monthlyPriceZar.toFixed(2),
      item_name: `Heita ${plan.name} monthly`,
      custom_str1: input.businessId,
      custom_str2: input.planId,
    };

    fields.signature = createPayFastSignature(fields);
    return { kind: "form_post", url: processUrl(), fields };
  },
  async verifyAndParseWebhook(
    request: Request,
    rawBody: string,
  ): Promise<NormalizedPaymentEvent | null> {
    const fields = parseForm(rawBody);
    const receivedSignature = fields.signature;
    if (!receivedSignature) throw new PaymentWebhookError("Missing signature.");

    const expectedSignature = createPayFastSignature(fields);
    if (!constantTimeEqual(receivedSignature, expectedSignature)) {
      logger.warn({}, "payfast.webhook.invalid_signature");
      throw new PaymentWebhookError("Invalid signature.");
    }

    if (!(await isAllowedPayFastSource(request))) {
      logger.warn(
        { ip: getClientIp(request.headers) },
        "payfast.webhook.invalid_source",
      );
      throw new PaymentWebhookError("Invalid source.");
    }

    if (!(await validatePayFastPostback(rawBody))) {
      logger.warn({}, "payfast.webhook.invalid_postback");
      throw new PaymentWebhookError("Invalid postback.");
    }

    const businessId = fields.custom_str1;
    const planId = fields.custom_str2;
    if (!businessId || !isPaidPlanId(planId)) {
      logger.warn({}, "payfast.webhook.missing_metadata");
      return null;
    }

    assertAmountMatches(fields, planId);

    const status = fields.payment_status?.toUpperCase();
    if (status === "COMPLETE") {
      return {
        provider: "PAYFAST",
        type: "payment_succeeded",
        businessId,
        planId,
        providerPaymentId: fields.pf_payment_id || fields.m_payment_id,
        providerSubscriptionId: fields.token,
        amountZar: Number(fields.amount_gross),
      };
    }

    if (status === "FAILED" || status === "CANCELLED") {
      return {
        provider: "PAYFAST",
        type: "payment_failed",
        businessId,
        planId,
        providerPaymentId: fields.pf_payment_id || fields.m_payment_id,
        amountZar: Number(fields.amount_gross),
      };
    }

    logger.debug({ status }, "payfast.webhook.unhandled_event");
    return null;
  },
};
