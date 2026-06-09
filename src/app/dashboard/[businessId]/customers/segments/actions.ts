"use server";

import type { Route } from "next";
import { StaffRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { validateSegmentRules } from "@/lib/segments";
import { requireRole } from "@/lib/staff";
import {
  createSegment,
  deleteSegment
} from "@/server/services/segment.service";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

const SEGMENT_MANAGER_ROLES = [StaffRole.OWNER, StaffRole.MANAGER];

function isNextRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.startsWith("NEXT_REDIRECT") ||
      Boolean((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")))
  );
}

export async function createSegmentAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const base = `/dashboard/${businessId}/customers/segments`;

  if (!userId) {
    redirect(`/sign-in?callbackUrl=${base}`);
  }

  try {
    await requireRole({ businessId, userId, allowedRoles: SEGMENT_MANAGER_ROLES });

    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      throw new Error("Give the segment a name.");
    }
    const description = String(formData.get("description") ?? "").trim() || undefined;

    let parsed: unknown;
    try {
      parsed = JSON.parse(String(formData.get("rules") ?? "null"));
    } catch {
      throw new Error("Segment rules were malformed.");
    }
    const rules = validateSegmentRules(parsed);

    const segment = await createSegment({ businessId, name, description, rules });

    await recordStaffAuditLog({
      businessId,
      actorUserId: userId,
      action: "segment.create",
      targetType: "CustomerSegment",
      targetId: segment.id,
      metadata: { name, ruleCount: rules.rules.length, matchAll: rules.matchAll }
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Could not create the segment.";
    redirect(`${base}?segment=error&reason=${encodeURIComponent(message)}` as Route);
  }

  redirect(`${base}?segment=created` as Route);
}

export async function deleteSegmentAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const segmentId = String(formData.get("segmentId") ?? "");
  const base = `/dashboard/${businessId}/customers/segments`;

  if (!userId) {
    redirect(`/sign-in?callbackUrl=${base}`);
  }

  try {
    await requireRole({ businessId, userId, allowedRoles: SEGMENT_MANAGER_ROLES });

    if (!segmentId) {
      throw new Error("Missing segment.");
    }

    const result = await deleteSegment(segmentId, businessId);
    if (result.count === 0) {
      throw new Error("That segment no longer exists.");
    }

    await recordStaffAuditLog({
      businessId,
      actorUserId: userId,
      action: "segment.delete",
      targetType: "CustomerSegment",
      targetId: segmentId
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Could not delete the segment.";
    redirect(`${base}?segment=error&reason=${encodeURIComponent(message)}` as Route);
  }

  redirect(`${base}?segment=deleted` as Route);
}
