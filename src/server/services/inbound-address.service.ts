import { MessageChannel, StaffRole } from "@prisma/client";

import { normalizeZaPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

const TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 };
const MANAGER_ROLES = [StaffRole.OWNER, StaffRole.MANAGER] as const;

function normalizeEmailAddress(raw: string) {
  const value = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error("Enter a valid inbound email address.");
  }
  return value;
}

function normalizeSmsAddress(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error("Inbound SMS address is required.");
  const normalizedPhone = normalizeZaPhone(value);
  if (normalizedPhone) return normalizedPhone.toLowerCase();
  if (!/^[a-zA-Z0-9_+.-]{2,64}$/.test(value)) {
    throw new Error("SMS address must be an E.164 number, shortcode, or provider keyword.");
  }
  return value.toLowerCase();
}

function normalizeAddress(channel: MessageChannel, raw: string) {
  if (channel === MessageChannel.EMAIL) return normalizeEmailAddress(raw);
  if (channel === MessageChannel.SMS) return normalizeSmsAddress(raw);
  throw new Error("Only SMS and email inbound addresses are supported.");
}

function defaultProvider(channel: MessageChannel) {
  return channel === MessageChannel.EMAIL ? "resend" : "africas-talking";
}

export async function upsertBusinessInboundAddress(input: {
  businessId: string;
  actorUserId: string;
  channel: MessageChannel;
  address: string;
  provider?: string | null;
  label?: string | null;
}) {
  await requireRole({
    businessId: input.businessId,
    userId: input.actorUserId,
    allowedRoles: [...MANAGER_ROLES]
  });

  const channel = input.channel;
  const provider = input.provider?.trim().toLowerCase() || defaultProvider(channel);
  const address = normalizeAddress(channel, input.address);
  const label = input.label?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.businessInboundAddress.findUnique({
      where: { channel_provider_address: { channel, provider, address } }
    });

    if (existing && existing.businessId !== input.businessId) {
      throw new Error("That inbound address is already connected to another business.");
    }

    const row = existing
      ? await tx.businessInboundAddress.update({
          where: { id: existing.id },
          data: { label, isActive: true }
        })
      : await tx.businessInboundAddress.create({
          data: {
            businessId: input.businessId,
            channel,
            provider,
            address,
            label,
            isActive: true
          }
        });

    await recordStaffAuditLog({
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      action: "business.inbound_address.upsert",
      targetType: "BusinessInboundAddress",
      targetId: row.id,
      metadata: { channel, provider, address, label }
    }, tx);

    return row;
  }, TX_OPTIONS);
}

export async function deleteBusinessInboundAddress(input: {
  businessId: string;
  actorUserId: string;
  addressId: string;
}) {
  await requireRole({
    businessId: input.businessId,
    userId: input.actorUserId,
    allowedRoles: [...MANAGER_ROLES]
  });

  return prisma.$transaction(async (tx) => {
    const update = await tx.businessInboundAddress.updateMany({
      where: { id: input.addressId, businessId: input.businessId },
      data: { isActive: false }
    });
    if (update.count === 0) throw new Error("Inbound address not found.");

    const row = await tx.businessInboundAddress.findUniqueOrThrow({
      where: { id: input.addressId },
      select: { id: true, channel: true, provider: true, address: true }
    });

    await recordStaffAuditLog({
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      action: "business.inbound_address.disable",
      targetType: "BusinessInboundAddress",
      targetId: row.id,
      metadata: { channel: row.channel, provider: row.provider, address: row.address }
    }, tx);

    return row;
  }, TX_OPTIONS);
}
