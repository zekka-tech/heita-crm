import { MessageChannel, OutboundDocumentKind, StaffRole } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { scanStoredObjectForMalware } from "@/lib/malware-scan";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import { deleteStoredObject, putStoredObject, storageConfigured } from "@/lib/storage";
import { sendOnChannel, type ChannelDispatchResult } from "@/server/services/channel-dispatch.service";
import { requirePaidBusinessPlan } from "@/server/services/billing.service";
import { scheduleFollowUp } from "@/server/services/follow-up.service";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

const TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 };
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp"
]);

function sanitizeFileName(fileName: string) {
  const clean = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return clean.slice(0, 120) || "document";
}

function followUpDueAt(hours: number | null | undefined) {
  if (!hours || hours <= 0) return null;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export async function attachDocument(input: {
  businessId: string;
  threadId: string;
  actorUserId: string;
  kind: OutboundDocumentKind;
  file: File;
  title?: string | null;
}) {
  await requireRole({ businessId: input.businessId, userId: input.actorUserId, allowedRoles: [StaffRole.STAFF] });
  await requirePaidBusinessPlan(input.businessId, "Sales document sending");
  if (!storageConfigured()) throw new Error("Document storage is not configured.");
  if (input.file.size <= 0) throw new Error("Document file is empty.");
  if (input.file.size > MAX_DOCUMENT_BYTES) throw new Error("Document must be 15 MB or smaller.");
  if (!ALLOWED_DOCUMENT_TYPES.has(input.file.type)) {
    throw new Error("Document must be a PDF, PNG, JPEG, or WebP file.");
  }

  const thread = await prisma.salesThread.findFirstOrThrow({
    where: { id: input.threadId, businessId: input.businessId },
    select: { id: true }
  });

  const fileName = sanitizeFileName(input.file.name);
  const documentId = randomUUID();
  const storageKey = "businesses/" + input.businessId + "/sales/" + thread.id + "/" + documentId + "-" + fileName;
  const buffer = Buffer.from(await input.file.arrayBuffer());
  await putStoredObject({ key: storageKey, body: buffer, contentType: input.file.type });

  const scan = await scanStoredObjectForMalware({ storageKey, fileName });
  if (scan.verdict === "infected") {
    await deleteStoredObject(storageKey).catch(() => undefined);
    throw new Error("Document failed a malware scan and was rejected.");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const document = await tx.outboundDocument.create({
        data: {
          businessId: input.businessId,
          salesThreadId: thread.id,
          kind: input.kind,
          title: input.title?.trim() || fileName,
          fileName,
          mimeType: input.file.type,
          byteSize: input.file.size,
          storageKey,
          uploadedByUserId: input.actorUserId
        }
      });
      await recordStaffAuditLog({
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: "sales.document.attach",
        targetType: "OutboundDocument",
        targetId: document.id,
        metadata: { kind: input.kind, byteSize: input.file.size, mimeType: input.file.type }
      }, tx);
      return document;
    }, TX_OPTIONS);
  } catch (error) {
    await deleteStoredObject(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function sendDocument(input: {
  businessId: string;
  threadId: string;
  documentId: string;
  channels: MessageChannel[];
  body: string;
  actorUserId: string;
}) {
  await requireRole({ businessId: input.businessId, userId: input.actorUserId, allowedRoles: [StaffRole.STAFF] });
  await requirePaidBusinessPlan(input.businessId, "Sales document sending");
  const channels = [...new Set(input.channels)].filter((channel) => channel !== MessageChannel.PUSH);
  if (!channels.length) throw new Error("Select at least one send channel.");
  const body = input.body.trim();
  if (!body) throw new Error("Message body is required.");

  const thread = await prisma.salesThread.findFirstOrThrow({
    where: { id: input.threadId, businessId: input.businessId },
    include: { stage: true }
  });
  const document = await prisma.outboundDocument.findFirstOrThrow({
    where: { id: input.documentId, businessId: input.businessId, salesThreadId: input.threadId }
  });

  const results: ChannelDispatchResult[] = [];
  const primaryChannel = channels[0]!;
  for (const channel of channels) {
    results.push(await sendOnChannel({
      businessId: input.businessId,
      thread,
      channel,
      body,
      document
    }));
  }

  const now = new Date();
  const dueAt = followUpDueAt(thread.stage.defaultFollowUpHours);
  await prisma.$transaction(async (tx) => {
    await tx.salesThread.update({
      where: { id: thread.id },
      data: {
        lastOutboundAt: now,
        preferredChannel: primaryChannel,
        nextFollowUpAt: dueAt
      }
    });
    await recordStaffAuditLog({
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      action: "sales.document.send",
      targetType: "OutboundDocument",
      targetId: document.id,
      metadata: { threadId: thread.id, channels, messageIds: results.map((result) => result.messageId) }
    }, tx);
  }, TX_OPTIONS);

  if (dueAt) {
    await scheduleFollowUp({
      businessId: input.businessId,
      threadId: thread.id,
      stageId: thread.stageId,
      channel: primaryChannel,
      dueAt,
      reason: "document_sent"
    });
  }

  return { results, dueAt };
}
