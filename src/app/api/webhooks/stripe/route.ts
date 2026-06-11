import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { PaymentWebhookError } from "@/server/services/payments/gateway";
import { stripeGateway } from "@/server/services/payments/stripe";
import { applyPaymentEvent } from "@/server/services/billing.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  try {
    const event = await stripeGateway.verifyAndParseWebhook(request, rawBody);
    await applyPaymentEvent(event);
    return NextResponse.json({ received: true });
  } catch (err) {
    if (err instanceof PaymentWebhookError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error({ err }, "stripe.webhook.handler_error");
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}
