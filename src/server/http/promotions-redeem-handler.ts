import { NextResponse } from "next/server";
import { z } from "zod";

import { csrfFailureResponse } from "@/lib/csrf";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { authenticateRequestUser } from "@/lib/request-auth";
import { redeemPromotionCode } from "@/server/services/promotions.service";

const RedeemCodeSchema = z.object({
  businessId: z.string().min(1),
  code: z.string().trim().min(1).max(64)
});

export async function handleRedeemPromotionCodeRequest(request: Request) {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await authenticateRequestUser(request.headers);
  if (!session?.userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const limit = await enforceRateLimit({
    identifier: `promotion-redeem:${session.userId}`,
    windowSeconds: 60,
    max: 10
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Slow down before trying another code." },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = RedeemCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  try {
    const promotion = await redeemPromotionCode({
      businessId: parsed.data.businessId,
      userId: session.userId,
      code: parsed.data.code
    });

    return NextResponse.json({
      ok: true,
      promotion: {
        id: promotion.id,
        title: promotion.title,
        description: promotion.description,
        type: promotion.type,
        startsAt: promotion.startsAt.toISOString(),
        endsAt: promotion.endsAt.toISOString(),
        code: promotion.code,
        imageUrl: promotion.imageUrl
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Redemption failed." },
      { status: 400 }
    );
  }
}
