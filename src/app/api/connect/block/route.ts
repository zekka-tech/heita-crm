import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { withBusinessScope } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/connect/block
 * Staff-only: block or unblock a conversation.
 * Blocked conversations cannot receive new in-app messages.
 * Logged in StaffAuditLog for POPIA accountability.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { conversationId?: string; businessId?: string; block?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { conversationId, businessId, block = true } = body;

  if (!conversationId || !businessId) {
    return NextResponse.json(
      { error: "conversationId and businessId are required." },
      { status: 400 }
    );
  }

  try {
    await requireRole({
      businessId,
      userId,
      allowedRoles: ["OWNER", "MANAGER", "STAFF"]
    });
  } catch {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const conversation = await withBusinessScope(businessId, (tx) =>
      tx.conversation.findFirst({
        where: { id: conversationId, businessId },
        select: { id: true, customerId: true, status: true }
      })
    );

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    const newStatus = block ? "BLOCKED" : "ACTIVE";
    await withBusinessScope(businessId, (tx) =>
      tx.conversation.update({
        where: { id: conversationId },
        data: { status: newStatus }
      })
    );

    await recordStaffAuditLog({
      businessId,
      actorUserId: userId,
      action: block ? "CONVERSATION_BLOCKED" : "CONVERSATION_UNBLOCKED",
      targetType: "Conversation",
      targetId: conversationId,
      metadata: { customerId: conversation.customerId, previousStatus: conversation.status }
    });

    logger.info({ businessId, conversationId, actorUserId: userId, block }, "connect.block.updated");
    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err) {
    logger.error({ err }, "connect.block.error");
    return NextResponse.json({ error: "Failed to update conversation status." }, { status: 500 });
  }
}
