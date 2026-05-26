"use server";

import { StaffRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requestStaffStepUpOtp, requireFreshStaffStepUp, verifyStaffStepUpOtp } from "@/lib/staff-step-up";
import { requireRole } from "@/lib/staff";
import { sendOtpSms } from "@/lib/sms";
import {
  earnPoints,
  redeemPoints,
  refundTransaction
} from "@/server/services/loyalty.service";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

export async function requestStaffStepUpAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");

  if (!userId || !session.user.phone) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  await requireRole({
    businessId,
    userId,
    allowedRoles: [StaffRole.STAFF, StaffRole.AI_TRAINER]
  });

  const { code } = await requestStaffStepUpOtp({
    phone: session.user.phone
  });

  await sendOtpSms({
    to: session.user.phone,
    code
  });

  const params = new URLSearchParams({
    stepUp: "requested"
  });
  if (process.env.NODE_ENV !== "production") {
    params.set("devCode", code);
  }

  redirect(`/dashboard/${businessId}/loyalty?${params.toString()}`);
}

export async function verifyStaffStepUpAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const code = String(formData.get("code") ?? "");

  if (!userId || !session?.user?.phone) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  await requireRole({
    businessId,
    userId,
    allowedRoles: [StaffRole.STAFF, StaffRole.AI_TRAINER]
  });

  const verified = await verifyStaffStepUpOtp({
    userId,
    businessId,
    phone: session.user.phone,
    code
  });

  redirect(
    `/dashboard/${businessId}/loyalty?stepUp=${verified ? "verified" : "invalid"}`
  );
}

export async function earnPointsAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const points = Number(formData.get("points") ?? 0);
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  await requireRole({
    businessId,
    userId,
    allowedRoles: [StaffRole.STAFF]
  });
  await requireFreshStaffStepUp({ businessId, userId });

  await earnPoints({
    businessId,
    membershipId,
    points,
    actorUserId: userId,
    idempotencyKey,
    description,
    staffAudit: true
  });

  redirect(`/dashboard/${businessId}/loyalty?updated=earn`);
}

export async function redeemPointsAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const points = Number(formData.get("points") ?? 0);
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  await requireRole({
    businessId,
    userId,
    allowedRoles: [StaffRole.MANAGER]
  });
  await requireFreshStaffStepUp({ businessId, userId });

  await redeemPoints({
    businessId,
    membershipId,
    points,
    actorUserId: userId,
    idempotencyKey,
    description,
    staffAudit: true
  });

  redirect(`/dashboard/${businessId}/loyalty?updated=redeem`);
}

export async function createRewardAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const pointsCost = Number(formData.get("pointsCost") ?? 0);
  const stockValue = String(formData.get("stock") ?? "").trim();

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  await requireRole({
    businessId,
    userId,
    allowedRoles: [StaffRole.MANAGER]
  });
  await requireFreshStaffStepUp({ businessId, userId });

  if (!title || !Number.isFinite(pointsCost) || pointsCost <= 0) {
    throw new Error("Reward title and points cost are required.");
  }

  await prisma.$transaction(async (tx) => {
    const reward = await tx.reward.create({
      data: {
        businessId,
        title,
        description,
        pointsCost,
        stock: stockValue ? Number(stockValue) : null
      }
    });

    await recordStaffAuditLog(
      {
        businessId,
        actorUserId: userId,
        action: "LOYALTY_REWARD_CREATE",
        targetType: "Reward",
        targetId: reward.id,
        metadata: {
          title,
          pointsCost,
          stock: reward.stock
        }
      },
      tx
    );
  });

  redirect(`/dashboard/${businessId}/loyalty?updated=reward`);
}

export async function updateTierPerksAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const tierId = String(formData.get("tierId") ?? "");
  const pointMultiplierRaw = String(formData.get("pointMultiplier") ?? "").trim();
  const freeDelivery = String(formData.get("freeDelivery") ?? "") === "on";
  const exclusiveAccess = String(formData.get("exclusiveAccess") ?? "") === "on";

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  await requireRole({
    businessId,
    userId,
    allowedRoles: [StaffRole.OWNER]
  });
  await requireFreshStaffStepUp({ businessId, userId });

  const pointMultiplier = pointMultiplierRaw ? Number(pointMultiplierRaw) : undefined;

  const perks = {
    ...(pointMultiplier && Number.isFinite(pointMultiplier) && pointMultiplier > 1
      ? { pointMultiplier }
      : {}),
    ...(freeDelivery ? { freeDelivery: true } : {}),
    ...(exclusiveAccess ? { exclusiveAccess: true } : {})
  };

  await prisma.$transaction(async (tx) => {
    await tx.loyaltyTier.updateMany({
      where: {
        id: tierId,
        businessId
      },
      data: {
        perks
      }
    });

    await recordStaffAuditLog(
      {
        businessId,
        actorUserId: userId,
        action: "LOYALTY_TIER_PERKS_UPDATE",
        targetType: "LoyaltyTier",
        targetId: tierId,
        metadata: perks
      },
      tx
    );
  });

  redirect(`/dashboard/${businessId}/loyalty?updated=tier-perks`);
}

export async function refundTransactionAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  await requireRole({
    businessId,
    userId,
    allowedRoles: [StaffRole.MANAGER]
  });
  await requireFreshStaffStepUp({ businessId, userId });

  await refundTransaction({
    businessId,
    transactionId,
    actorUserId: userId,
    idempotencyKey,
    description,
    staffAudit: true
  });

  redirect(`/dashboard/${businessId}/loyalty?updated=refund`);
}

export async function queueCustomerImportAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const file = formData.get("csvFile");

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  await requireRole({
    businessId,
    userId,
    allowedRoles: [StaffRole.MANAGER]
  });
  await requireFreshStaffStepUp({ businessId, userId });

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a CSV file to import.");
  }

  const fileName = file.name || "customer-import.csv";
  if (!fileName.toLowerCase().endsWith(".csv")) {
    throw new Error("Only CSV imports are supported.");
  }

  if (file.size > 1_000_000) {
    throw new Error("CSV imports are limited to 1 MB per file.");
  }

  const sourceCsv = await file.text();
  const [{ enqueueCustomerImportRun }, { createCustomerImportRun }] =
    await Promise.all([
      import("@/lib/customer-import-queue"),
      import("@/server/services/customer-import.service")
    ]);

  const importRun = await createCustomerImportRun({
    businessId,
    actorUserId: userId,
    fileName,
    sourceCsv
  });

  await enqueueCustomerImportRun(importRun.id);

  redirect(`/dashboard/${businessId}/loyalty?updated=import`);
}
