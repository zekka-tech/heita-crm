import { NextResponse } from "next/server";
import { z } from "zod";

import { observeHttpRoute, incrementPosMetric } from "@/lib/metrics";
import { normalizeZaPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { constantTimeEqual, getClientIp, hmacSha256 } from "@/lib/security";
import { withSpan } from "@/lib/tracing";
import { earnPoints } from "@/server/services/loyalty.service";

const PayloadSchema = z.object({
  businessId: z.string().min(1).optional(),
  businessSlug: z.string().min(1).optional(),
  externalTransactionId: z.string().min(1).max(120),
  phone: z.string().min(5),
  points: z.number().int().min(1).max(100000),
  description: z.string().trim().max(200).optional()
});

const POS_PER_BUSINESS_PER_MINUTE = Number(
  process.env.POS_RATE_LIMIT_PER_BUSINESS_PER_MINUTE ?? 180
);
const POS_PER_BUSINESS_IP_PER_MINUTE = Number(
  process.env.POS_RATE_LIMIT_PER_BUSINESS_IP_PER_MINUTE ?? 60
);

function verifySignature(input: {
  timestamp: string | null;
  signature: string | null;
  body: string;
}) {
  const secret = process.env.POS_SHARED_SECRET;
  if (!secret || !input.timestamp || !input.signature) {
    return false;
  }

  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > 5 * 60) {
    return false;
  }

  const expected = hmacSha256(secret, `${input.timestamp}.${input.body}`);
  return constantTimeEqual(input.signature, expected);
}

export async function handlePosTransaction(request: Request) {
  const startedAt = Date.now();
  const clientIp = getClientIp(request.headers);
  const rawBody = await request.text();
  const signature = request.headers.get("x-heita-signature");
  const timestamp = request.headers.get("x-heita-timestamp");

  if (!verifySignature({ timestamp, signature, body: rawBody })) {
    observeHttpRoute({
      route: "/api/integrations/transactions",
      method: "POST",
      status: 401,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    observeHttpRoute({
      route: "/api/integrations/transactions",
      method: "POST",
      status: 400,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success || (!parsed.data.businessId && !parsed.data.businessSlug)) {
    observeHttpRoute({
      route: "/api/integrations/transactions",
      method: "POST",
      status: 400,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ error: "Invalid transaction payload." }, { status: 400 });
  }

  const phone = normalizeZaPhone(parsed.data.phone);
  if (!phone) {
    observeHttpRoute({
      route: "/api/integrations/transactions",
      method: "POST",
      status: 400,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ error: "Invalid customer phone number." }, { status: 400 });
  }

  const business = await prisma.business.findFirst({
    where: {
      deletedAt: null,
      isActive: true,
      ...(parsed.data.businessId ? { id: parsed.data.businessId } : { slug: parsed.data.businessSlug })
    }
  });

  if (!business) {
    observeHttpRoute({
      route: "/api/integrations/transactions",
      method: "POST",
      status: 404,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ error: "Business not found." }, { status: 404 });
  }

  const businessBurstLimit = await enforceRateLimit({
    identifier: `pos:business:${business.id}`,
    windowSeconds: 60,
    max: POS_PER_BUSINESS_PER_MINUTE
  });
  if (!businessBurstLimit.allowed) {
    incrementPosMetric("rate_limited", business.id);
    observeHttpRoute({
      route: "/api/integrations/transactions",
      method: "POST",
      status: 429,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "POS transaction rate limit exceeded for this business." },
      { status: 429, headers: rateLimitHeaders(businessBurstLimit) }
    );
  }

  const businessIpLimit = await enforceRateLimit({
    identifier: `pos:business-ip:${business.id}:${clientIp}`,
    windowSeconds: 60,
    max: POS_PER_BUSINESS_IP_PER_MINUTE
  });
  if (!businessIpLimit.allowed) {
    incrementPosMetric("rate_limited", business.id);
    observeHttpRoute({
      route: "/api/integrations/transactions",
      method: "POST",
      status: 429,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "POS transaction rate limit exceeded for this source." },
      { status: 429, headers: rateLimitHeaders(businessIpLimit) }
    );
  }

  const user = await prisma.user.findFirst({
    where: { phone, deletedAt: null }
  });
  if (!user) {
    incrementPosMetric("unknown_user", business.id);
    observeHttpRoute({
      route: "/api/integrations/transactions",
      method: "POST",
      status: 404,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Customer is not registered with this phone number." },
      { status: 404 }
    );
  }

  const membership = await prisma.membership.findUnique({
    where: {
      businessId_userId: {
        businessId: business.id,
        userId: user.id
      }
    }
  });
  if (!membership) {
    incrementPosMetric("unknown_membership", business.id);
    observeHttpRoute({
      route: "/api/integrations/transactions",
      method: "POST",
      status: 404,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Customer is not a member of this business." },
      { status: 404 }
    );
  }

  const result = await withSpan(
    "integrations.pos_transaction",
    {
      "heita.business_id": business.id,
      "heita.client_ip": clientIp
    },
    async () =>
      earnPoints({
        businessId: business.id,
        membershipId: membership.id,
        points: parsed.data.points,
        actorUserId: user.id,
        idempotencyKey: `pos:${business.id}:${parsed.data.externalTransactionId}`,
        description: parsed.data.description ?? "POS transaction"
      })
  );

  incrementPosMetric("accepted", business.id);
  observeHttpRoute({
    route: "/api/integrations/transactions",
    method: "POST",
    status: 200,
    durationMs: Date.now() - startedAt
  });

  return NextResponse.json({
    ok: true,
    membershipId: result.id,
    pointsBalance: result.pointsBalance
  });
}
