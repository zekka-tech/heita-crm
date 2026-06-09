import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { generatePromotionSuggestions } from "@/server/services/ai-promotion.service";

export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_MINUTE = 10;
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
    identifier: `ai:promotion-suggestions:${userId}`,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    max: RATE_LIMIT_PER_MINUTE
  });

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before requesting more suggestions." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rl.resetInSeconds)
        }
      }
    );
  }

  let body: { businessId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { businessId } = body;
  if (!businessId) {
    return NextResponse.json(
      { error: "businessId is required." },
      { status: 400 }
    );
  }

  const staffMember = await prisma.staffMember.findUnique({
    where: { businessId_userId: { businessId, userId } },
    select: { id: true }
  });

  if (!staffMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const suggestions = await generatePromotionSuggestions(businessId);
    return NextResponse.json({ suggestions });
  } catch (error) {
    logger.error(
      { err: error, businessId, userId },
      "promotion.ai.suggestion_error"
    );
    return NextResponse.json(
      { error: "Failed to generate suggestions." },
      { status: 500 }
    );
  }
}
