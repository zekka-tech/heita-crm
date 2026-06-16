import { randomUUID } from "node:crypto";

import { BusinessCategory, Prisma, Province, StaffRole } from "@prisma/client";

import { createJoinToken, createUniqueBusinessSlug } from "@/lib/business";
import { scanStoredObjectForMalware } from "@/lib/malware-scan";
import { isE164, maskPhone, normalizeZaPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import type { LeadAttribution } from "@/lib/telemetry-events";
import {
  deleteStoredObject,
  getStoredObjectUrl,
  putStoredObject,
  storageConfigured
} from "@/lib/storage";
import { DEFAULT_PIPELINE_STAGES } from "@/server/services/pipeline-stage-defaults";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

// Allowed logo image types mapped to their file extension.
const LOGO_CONTENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
};
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Validates, stores, and malware-scans a business logo image, returning its
 * public URL. Throws a user-facing Error on any validation/scan failure.
 */
export async function uploadBusinessLogo(file: File): Promise<string> {
  const extension = LOGO_CONTENT_TYPES[file.type];
  if (!extension) {
    throw new Error("Logo must be a PNG, JPEG, or WebP image.");
  }
  if (file.size === 0) {
    throw new Error("Logo image is empty.");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("Logo must be 2 MB or smaller.");
  }
  if (!storageConfigured()) {
    throw new Error("Image storage is not configured.");
  }

  const key = `business-logos/${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await putStoredObject({ key, body: buffer, contentType: file.type });

  const scan = await scanStoredObjectForMalware({ storageKey: key, fileName: file.name });
  if (scan.verdict === "infected") {
    await deleteStoredObject(key).catch(() => undefined);
    throw new Error("Logo failed a malware scan and was rejected.");
  }

  const url = getStoredObjectUrl(key);
  if (!url) {
    await deleteStoredObject(key).catch(() => undefined);
    throw new Error("Image storage has no public URL configured.");
  }

  return url;
}

const BUSINESS_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 15_000
};

const WHATSAPP_MANAGER_ROLES = [StaffRole.OWNER, StaffRole.MANAGER] as const;
// Meta's WhatsApp phone-number ID is an opaque numeric string (~15-16 digits).
const WABA_PHONE_ID_PATTERN = /^\d{6,20}$/;

type CreateBusinessInput = {
  userId: string;
  name: string;
  description?: string | null;
  category: BusinessCategory;
  province: Province;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  loyaltySignupBonus?: number;
  attribution?: LeadAttribution;
};

export async function createBusinessWithDefaults(input: CreateBusinessInput) {
  const slug = await createUniqueBusinessSlug(input.name);
  const qrToken = createJoinToken("qr");
  const joinToken = createJoinToken("join");

  return prisma.business.create({
    data: {
      slug,
      name: input.name,
      description: input.description || null,
      category: input.category,
      province: input.province,
      phone: input.phone || null,
      email: input.email || null,
      logoUrl: input.logoUrl || null,
      loyaltySignupBonus: input.loyaltySignupBonus ?? 100,
      acquisitionSource: input.attribution?.leadSource ?? null,
      acquisitionMedium: input.attribution?.leadMedium ?? null,
      acquisitionCampaign: input.attribution?.leadCampaign ?? null,
      staffMembers: {
        create: {
          userId: input.userId,
          role: StaffRole.OWNER
        }
      },
      aiWorkspace: {
        create: {}
      },
      pipelineStages: {
        create: DEFAULT_PIPELINE_STAGES.map((stage) => ({
          key: stage.key,
          label: stage.label,
          order: stage.order,
          isTerminal: stage.isTerminal ?? false,
          defaultFollowUpHours: stage.defaultFollowUpHours ?? null,
          autoAdvanceOnReply: stage.autoAdvanceOnReply ?? true
        }))
      },
      loyaltyTiers: {
        create: [
          {
            name: "Bronze",
            minPoints: 0,
            rank: 1,
            colorHex: "#B76E3B",
            perks: {}
          },
          {
            name: "Silver",
            minPoints: 500,
            rank: 2,
            colorHex: "#7C8A97",
            perks: {
              pointMultiplier: 1.1,
              exclusiveAccess: true
            }
          },
          {
            name: "Gold",
            minPoints: 1500,
            rank: 3,
            colorHex: "#D99825",
            perks: {
              pointMultiplier: 1.25,
              exclusiveAccess: true,
              freeDelivery: true
            }
          }
        ]
      },
      qrCodes: {
        create: {
          name: "Primary join QR",
          token: qrToken,
          isPrimary: true
        }
      },
      joinLinks: {
        create: {
          name: "Primary join link",
          token: joinToken,
          channel: "DIRECT_LINK"
        }
      }
    },
    include: {
      qrCodes: true,
      joinLinks: true,
      loyaltyTiers: true
    }
  });
}

type UpdateBusinessWhatsAppInput = {
  businessId: string;
  actorUserId: string;
  /** Meta WhatsApp phone-number ID (digits). Empty/null disconnects WhatsApp. */
  wabaPhoneId?: string | null;
  /** Customer-facing WhatsApp number; accepts loose input, stored as E.164. */
  whatsappPhoneNumber?: string | null;
};

function normalizeWabaPhoneId(raw?: string | null): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (!WABA_PHONE_ID_PATTERN.test(value)) {
    throw new Error(
      "WhatsApp phone number ID must be the numeric ID from Meta (digits only)."
    );
  }
  return value;
}

function normalizeWhatsappDisplayNumber(raw?: string | null): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const normalized = normalizeZaPhone(value) ?? value;
  if (!isE164(normalized)) {
    throw new Error(
      "Enter the WhatsApp number in international format, e.g. +27821234567."
    );
  }
  return normalized;
}

/**
 * Connect (or disconnect) a business's WhatsApp Business number. Manager/owner
 * only; writes are audited. The `wabaPhoneId` is unique per business — a clash
 * surfaces a friendly error rather than a raw Prisma constraint failure.
 */
export async function updateBusinessWhatsApp(input: UpdateBusinessWhatsAppInput) {
  await requireRole({
    businessId: input.businessId,
    userId: input.actorUserId,
    allowedRoles: [...WHATSAPP_MANAGER_ROLES]
  });

  const wabaPhoneId = normalizeWabaPhoneId(input.wabaPhoneId);
  const whatsappPhoneNumber = normalizeWhatsappDisplayNumber(input.whatsappPhoneNumber);

  try {
    return await prisma.$transaction(async (tx) => {
      const business = await tx.business.update({
        where: { id: input.businessId },
        data: { wabaPhoneId, whatsappPhoneNumber },
        select: { id: true, wabaPhoneId: true, whatsappPhoneNumber: true }
      });

      await recordStaffAuditLog(
        {
          businessId: input.businessId,
          actorUserId: input.actorUserId,
          action: "business.whatsapp.update",
          targetType: "Business",
          targetId: input.businessId,
          metadata: {
            wabaPhoneIdConnected: Boolean(wabaPhoneId),
            whatsappPhoneNumber: whatsappPhoneNumber
              ? maskPhone(whatsappPhoneNumber)
              : null
          }
        },
        tx
      );

      return business;
    }, BUSINESS_TRANSACTION_OPTIONS);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error(
        "That WhatsApp phone number ID is already connected to another business."
      );
    }
    throw error;
  }
}
