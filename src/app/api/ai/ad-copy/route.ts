import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { withBusinessScope } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { generateAdCopy, isAdCopyChannel } from "@/server/services/ai-ad.service";
import {
  AiUsageQuotaExceededError,
  buildAiQuotaExceededResponse
} from "@/server/services/ai-usage.service";

export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_MINUTE = 8;
const RATE_LIMIT_WINDOW_SECONDS = 60;

export async function POST(request: NextRequest): Promise<Response> {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await enforceRateLimit({
    identifier: `ai:ad-copy:${userId}`,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    max: RATE_LIMIT_PER_MINUTE
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before generating more copy." },
      { status: 429, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(rl.resetInSeconds) } }
    );
  }

  let body: { businessId?: string; offer?: string; channel?: string; variantCount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { businessId, offer, channel, variantCount } = body;
  if (!businessId || !offer?.trim()) {
    return NextResponse.json({ error: "businessId and offer are required." }, { status: 400 });
  }
  if (channel !== undefined && !isAdCopyChannel(channel)) {
    return NextResponse.json({ error: "Invalid channel." }, { status: 400 });
  }

  const staffMember = await withBusinessScope(businessId, (tx) =>
    tx.staffMember.findUnique({
      where: { businessId_userId: { businessId, userId } },
      select: { id: true }
    })
  );
  if (!staffMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await generateAdCopy({
      businessId,
      userId,
      offer,
      channel: channel ?? "WHATSAPP",
      variantCount
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AiUsageQuotaExceededError) {
      return NextResponse.json(buildAiQuotaExceededResponse(error), { status: 402 });
    }
    logger.error({ err: error, businessId, userId }, "ai.ad_copy.error");
    return NextResponse.json({ error: "Failed to generate ad copy." }, { status: 500 });
  }
}
