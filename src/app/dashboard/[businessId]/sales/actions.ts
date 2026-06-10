"use server";

import { MessageChannel, OutboundDocumentKind, SalesThreadStatus } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { requireFreshStaffStepUp } from "@/lib/staff-step-up";
import { attachDocument, sendDocument } from "@/server/services/outbound-document.service";
import { approveAndSendFollowUp, skipFollowUp, snoozeFollowUp } from "@/server/services/follow-up.service";
import { advanceStage, createSalesThread, setThreadStatus } from "@/server/services/sales-thread.service";

function requireUser(session: { user?: { id?: string | null } } | null, businessId: string): string {
  const userId = session?.user?.id;
  if (!userId) redirect(("/sign-in?callbackUrl=/dashboard/" + businessId + "/sales") as never);
  return userId;
}

function parseChannels(formData: FormData) {
  return formData.getAll("channels").map(String).filter((value): value is MessageChannel => {
    return Object.values(MessageChannel).includes(value as MessageChannel);
  });
}

export async function createSalesThreadAction(formData: FormData) {
  await requireCsrfFormData(formData);
  const businessId = String(formData.get("businessId") ?? "");
  const session = await auth();
  const userId = requireUser(session, businessId);
  const thread = await createSalesThread({
    businessId,
    actorUserId: userId,
    contactPhone: String(formData.get("contactPhone") ?? ""),
    membershipId: String(formData.get("membershipId") ?? "") || null,
    title: String(formData.get("title") ?? ""),
    stageKey: String(formData.get("stageKey") ?? "") || null,
    preferredChannel: (String(formData.get("preferredChannel") ?? "") || null) as MessageChannel | null,
    valueZar: String(formData.get("valueZar") ?? "") || null
  });
  redirect(("/dashboard/" + businessId + "/sales/" + thread.id + "?created=1") as never);
}

export async function attachDocumentAction(formData: FormData) {
  await requireCsrfFormData(formData);
  const businessId = String(formData.get("businessId") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  const session = await auth();
  const userId = requireUser(session, businessId);
  await requireFreshStaffStepUp({ businessId, userId });
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Select a document to attach.");
  await attachDocument({
    businessId,
    threadId,
    actorUserId: userId,
    kind: (String(formData.get("kind") ?? "OTHER") || "OTHER") as OutboundDocumentKind,
    title: String(formData.get("title") ?? "") || null,
    file
  });
  redirect(("/dashboard/" + businessId + "/sales/" + threadId + "?updated=document") as never);
}

export async function sendDocumentAction(formData: FormData) {
  await requireCsrfFormData(formData);
  const businessId = String(formData.get("businessId") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  const session = await auth();
  const userId = requireUser(session, businessId);
  await requireFreshStaffStepUp({ businessId, userId });
  await sendDocument({
    businessId,
    threadId,
    documentId: String(formData.get("documentId") ?? ""),
    channels: parseChannels(formData),
    body: String(formData.get("body") ?? ""),
    actorUserId: userId
  });
  redirect(("/dashboard/" + businessId + "/sales/" + threadId + "?updated=sent") as never);
}

export async function advanceStageAction(formData: FormData) {
  await requireCsrfFormData(formData);
  const businessId = String(formData.get("businessId") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  const session = await auth();
  const userId = requireUser(session, businessId);
  await advanceStage({
    businessId,
    threadId,
    actorUserId: userId,
    toStageKey: String(formData.get("toStageKey") ?? "")
  });
  redirect(("/dashboard/" + businessId + "/sales/" + threadId + "?updated=stage") as never);
}

export async function setThreadStatusAction(formData: FormData) {
  await requireCsrfFormData(formData);
  const businessId = String(formData.get("businessId") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  const session = await auth();
  const userId = requireUser(session, businessId);
  await setThreadStatus({
    businessId,
    threadId,
    actorUserId: userId,
    status: String(formData.get("status") ?? "OPEN") as SalesThreadStatus
  });
  redirect(("/dashboard/" + businessId + "/sales/" + threadId + "?updated=status") as never);
}

export async function approveFollowUpAction(formData: FormData) {
  await requireCsrfFormData(formData);
  const businessId = String(formData.get("businessId") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  const session = await auth();
  const userId = requireUser(session, businessId);
  await requireFreshStaffStepUp({ businessId, userId });
  await approveAndSendFollowUp({
    businessId,
    taskId: String(formData.get("taskId") ?? ""),
    actorUserId: userId,
    editedBody: String(formData.get("body") ?? "")
  });
  redirect(("/dashboard/" + businessId + "/sales/" + threadId + "?updated=followup") as never);
}

export async function snoozeFollowUpAction(formData: FormData) {
  await requireCsrfFormData(formData);
  const businessId = String(formData.get("businessId") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  const session = await auth();
  const userId = requireUser(session, businessId);
  await snoozeFollowUp({
    businessId,
    taskId: String(formData.get("taskId") ?? ""),
    actorUserId: userId,
    dueAt: new Date(String(formData.get("dueAt") ?? ""))
  });
  redirect(("/dashboard/" + businessId + "/sales/" + threadId + "?updated=snoozed") as never);
}

export async function skipFollowUpAction(formData: FormData) {
  await requireCsrfFormData(formData);
  const businessId = String(formData.get("businessId") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  const session = await auth();
  const userId = requireUser(session, businessId);
  await skipFollowUp({
    businessId,
    taskId: String(formData.get("taskId") ?? ""),
    actorUserId: userId
  });
  redirect(("/dashboard/" + businessId + "/sales/" + threadId + "?updated=skipped") as never);
}
