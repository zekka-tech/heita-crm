import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request.headers);
  const rateLimit = await enforceRateLimit({
    identifier: `unsubscribe:${ip}`,
    windowSeconds: 60,
    max: 10
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const email = request.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Missing email parameter" }, { status: 400 });
  }

  await revokeMarketingConsent(email);
  return NextResponse.redirect(
    new URL("/profile/consents?unsubscribed=1", request.url)
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request.headers);
  const rateLimit = await enforceRateLimit({
    identifier: `unsubscribe:${ip}`,
    windowSeconds: 60,
    max: 10
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const body = await request.formData().catch(() => null);
  const raw = body?.get("List-Unsubscribe");
  const email = typeof raw === "string" ? raw : null;
  if (!email) {
    return NextResponse.json({ error: "Missing unsubscribe parameter" }, { status: 400 });
  }

  await revokeMarketingConsent(email);
  return NextResponse.json({ unsubscribed: true });
}

async function revokeMarketingConsent(email: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true }
  });

  if (!user) {
    logger.warn({ email }, "email.unsubscribe_user_not_found");
    return;
  }

  const result = await prisma.userConsent.updateMany({
    where: {
      userId: user.id,
      type: "EMAIL_MARKETING",
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });

  logger.info(
    { email, userId: user.id, count: result.count },
    "email.unsubscribe_consent_revoked"
  );
}
