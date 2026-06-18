import { StaffRole } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { runIdempotentOperation } from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import { withBusinessScope } from "@/lib/prisma";
import { assertOwnedStorageUrl } from "@/lib/security";
import { requireRole } from "@/lib/staff";
import { earnPoints } from "@/server/services/loyalty.service";

export const dynamic = "force-dynamic";

type SyncItem = {
  id: string;
  type: "earn_points" | "scan_receipt";
  payload: Record<string, unknown>;
  idempotencyKey: string;
};

type SyncRequestBody = {
  items: SyncItem[];
};

async function processEarnPoints(
  item: SyncItem,
  userId: string
): Promise<{ id: string; ok: boolean; error?: string }> {
  const payload = item.payload as {
    businessId?: string;
    membershipId?: string;
    points?: number;
    description?: string;
  };

  const businessId = String(payload.businessId ?? "").trim();
  const membershipId = String(payload.membershipId ?? "").trim();
  const points = Number(payload.points ?? 0);

  if (!businessId || !membershipId || !Number.isFinite(points) || points <= 0) {
    return { id: item.id, ok: false, error: "Invalid earn_points payload." };
  }

  try {
    await requireRole({
      businessId,
      userId,
      allowedRoles: [StaffRole.STAFF, StaffRole.MANAGER, StaffRole.OWNER]
    });
  } catch {
    return { id: item.id, ok: false, error: "Forbidden." };
  }

  try {
    await earnPoints({
      businessId,
      membershipId,
      points,
      actorUserId: userId,
      idempotencyKey: item.idempotencyKey,
      description: payload.description ?? undefined,
      staffAudit: true
    });

    return { id: item.id, ok: true };
  } catch (error) {
    logger.error(
      { err: error, itemId: item.id, businessId },
      "offline_sync.earn_points_failed"
    );
    return {
      id: item.id,
      ok: false,
      error: error instanceof Error ? error.message : "Failed to earn points."
    };
  }
}

async function processScanReceipt(
  item: SyncItem,
  userId: string
): Promise<{ id: string; ok: boolean; error?: string }> {
  const payload = item.payload as {
    businessId?: string;
    imageUrl?: string;
    membershipId?: string;
  };
  const businessId = String(payload.businessId ?? "").trim();
  const imageUrl = String(payload.imageUrl ?? "").trim();

  if (!businessId) {
    return { id: item.id, ok: false, error: "Invalid scan_receipt payload: missing businessId." };
  }
  if (!imageUrl) {
    return { id: item.id, ok: false, error: "Invalid scan_receipt payload: missing imageUrl." };
  }

  try {
    assertOwnedStorageUrl(imageUrl);
  } catch {
    return { id: item.id, ok: false, error: "Invalid scan_receipt payload: imageUrl must be a storage URL." };
  }

  try {
    await requireRole({
      businessId,
      userId,
      allowedRoles: [StaffRole.STAFF, StaffRole.MANAGER, StaffRole.OWNER]
    });
  } catch {
    return { id: item.id, ok: false, error: "Forbidden." };
  }

  try {
    await runIdempotentOperation({
      scope: `offline:scan_receipt:${businessId}`,
      key: item.idempotencyKey,
      execute: async () =>
        withBusinessScope(businessId, async (tx) => {
          await tx.ocrReceipt.create({
            data: {
              businessId,
              userId,
              imageUrl,
              membershipId: payload.membershipId ?? null
            }
          });
        }),
      replay: async () => undefined
    });

    return { id: item.id, ok: true };
  } catch (error) {
    logger.error(
      { err: error, itemId: item.id, businessId },
      "offline_sync.scan_receipt_failed"
    );
    return {
      id: item.id,
      ok: false,
      error: error instanceof Error ? error.message : "Failed to process receipt."
    };
  }
}

export async function POST(request: NextRequest) {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: SyncRequestBody;
  try {
    body = (await request.json()) as SyncRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "No items to sync." }, { status: 400 });
  }

  // Cap batch size to prevent DoS via sequential DB writes (audit finding 6).
  const MAX_SYNC_ITEMS = 100;
  if (body.items.length > MAX_SYNC_ITEMS) {
    return NextResponse.json(
      { error: `Cannot sync more than ${MAX_SYNC_ITEMS} items per request.` },
      { status: 400 }
    );
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const item of body.items) {
    if (!item.id || !item.type || !item.idempotencyKey) {
      results.push({ id: item.id ?? "unknown", ok: false, error: "Missing required fields." });
      continue;
    }

    if (item.type === "earn_points") {
      results.push(await processEarnPoints(item, session.user.id));
    } else if (item.type === "scan_receipt") {
      results.push(await processScanReceipt(item, session.user.id));
    } else {
      results.push({ id: item.id, ok: false, error: `Unknown type: ${item.type}` });
    }
  }

  const synced = results.filter((r) => r.ok).length;

  logger.info(
    { total: results.length, synced, userId: session.user.id },
    "offline_sync.completed"
  );

  return NextResponse.json({ results, synced, total: results.length });
}
