import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { withBusinessScope } from "@/lib/prisma";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await enforceRateLimit({
    identifier: `connect:report:${userId}`,
    windowSeconds: 3600,
    max: 3
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many reports. Please wait." }, { status: 429 });
  }

  let body: { conversationId?: string; businessId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { conversationId, businessId, reason } = body;

  if (!conversationId || !businessId) {
    return NextResponse.json(
      { error: "conversationId and businessId are required." },
      { status: 400 }
    );
  }

  const MAX_REASON_CHARS = 500;
  if (reason && reason.length > MAX_REASON_CHARS) {
    return NextResponse.json({ error: "reason is too long (max 500 chars)." }, { status: 400 });
  }

  try {
    const participant = await withBusinessScope(businessId, (tx) =>
      tx.conversationParticipant.findFirst({
        where: { conversationId, userId },
        select: { id: true }
      })
    );

    if (!participant) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const conversation = await withBusinessScope(businessId, (tx) =>
      tx.conversation.findFirst({
        where: { id: conversationId, businessId },
        select: { id: true, customerId: true }
      })
    );

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    await recordStaffAuditLog({
      businessId,
      actorUserId: userId,
      action: "CONVERSATION_REPORTED",
      targetType: "Conversation",
      targetId: conversationId,
      metadata: {
        reason: reason?.trim() ?? null,
        customerId: conversation.customerId,
        reportedAt: new Date().toISOString()
      }
    });

    logger.info({ businessId, conversationId, reporterUserId: userId }, "connect.report.submitted");
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "connect.report.error");
    return NextResponse.json({ error: "Failed to submit report." }, { status: 500 });
  }
}
