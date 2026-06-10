import { FollowUpStatus, MessageChannel, OutboundDocumentKind, SalesThreadStatus, StaffRole } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, Send, Sparkles } from "lucide-react";

import {
  advanceStageAction,
  approveFollowUpAction,
  attachDocumentAction,
  sendDocumentAction,
  setThreadStatusAction,
  skipFollowUpAction,
  snoozeFollowUpAction
} from "@/app/dashboard/[businessId]/sales/actions";
import { CsrfField } from "@/components/security/csrf-field";
import { Chip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/staff";
import { getThreadDetail, listPipelineStages } from "@/server/services/sales-thread.service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ businessId: string; threadId: string }>;
  searchParams?: Promise<{ updated?: string; created?: string }>;
};

function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-ZA") : "Not yet";
}

export default async function SalesThreadPage({ params, searchParams }: PageProps) {
  const { businessId, threadId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const session = await auth();
  if (!session?.user?.id) redirect(("/sign-in?callbackUrl=/dashboard/" + businessId + "/sales/" + threadId) as never);
  await requireRole({ businessId, userId: session.user.id, allowedRoles: [StaffRole.STAFF] });

  let thread;
  try {
    thread = await getThreadDetail({ businessId, threadId });
  } catch {
    notFound();
  }
  const stages = await listPipelineStages(businessId);
  const approvals = thread.followUpTasks.filter((task) => task.status === FollowUpStatus.AWAITING_APPROVAL);

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <div className="grid gap-5">
        <Link href={("/dashboard/" + businessId + "/sales") as never} className="inline-flex items-center gap-2 text-sm font-semibold text-primary-action">
          <ArrowLeft className="h-4 w-4" /> Back to pipeline
        </Link>

        <Card variant="hero" className="px-6 py-7 sm:px-10">
          <Chip variant="primary" className="border-white/20 bg-white/15 text-white">{thread.stage.label} · {thread.status}</Chip>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{thread.title}</h1>
          <p className="mt-2 text-white/85">{thread.membership?.user.name ?? thread.contactPhone} · Last reply: {formatDate(thread.lastCustomerReplyAt)} · Last outbound: {formatDate(thread.lastOutboundAt)}</p>
        </Card>

        {resolvedSearchParams.updated || resolvedSearchParams.created ? <Card variant="surface" className="text-sm text-success">Sales thread saved.</Card> : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid gap-5">
            <Card variant="surface" className="space-y-4">
              <header className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary-action" />
                <h2 className="section-title">Documents</h2>
              </header>
              <form action={attachDocumentAction} className="grid gap-3 md:grid-cols-2">
                <CsrfField />
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="threadId" value={thread.id} />
                <Input name="title" label="Document title" placeholder="June quote" />
                <label className="grid gap-1 text-sm font-medium text-ink">
                  Kind
                  <select name="kind" className="rounded-xl border border-line bg-surface-elevated px-3 py-2 text-sm text-ink">
                    {Object.values(OutboundDocumentKind).map((kind) => <option key={kind} value={kind}>{kind.replace(/_/g, " ")}</option>)}
                  </select>
                </label>
                <Input name="file" label="File" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" required className="md:col-span-2" />
                <SubmitButton variant="secondary" className="md:col-span-2">Attach document</SubmitButton>
              </form>

              <div className="grid gap-2">
                {thread.documents.map((document) => (
                  <div key={document.id} className="rounded-xl border border-line bg-surface-elevated p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">{document.title}</p>
                        <p className="text-xs text-ink-subtle">{document.kind.replace(/_/g, " ")} · {document.fileName} · {(document.byteSize / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <form action={sendDocumentAction} className="mt-3 grid gap-3">
                      <CsrfField />
                      <input type="hidden" name="businessId" value={businessId} />
                      <input type="hidden" name="threadId" value={thread.id} />
                      <input type="hidden" name="documentId" value={document.id} />
                      <Textarea name="body" label="Message" rows={3} defaultValue={"Hi, please find " + document.title + " attached. Let us know if you have any questions."} required />
                      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                        {[MessageChannel.WHATSAPP, MessageChannel.IN_APP, MessageChannel.EMAIL, MessageChannel.SMS].map((channel) => (
                          <label key={channel} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                            <input type="checkbox" name="channels" value={channel} defaultChecked={channel === (thread.preferredChannel ?? MessageChannel.WHATSAPP)} />
                            {channel}
                          </label>
                        ))}
                      </div>
                      <SubmitButton variant="primary"><Send className="h-4 w-4" /> Send document</SubmitButton>
                    </form>
                  </div>
                ))}
                {!thread.documents.length ? <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-muted">No documents attached yet.</p> : null}
              </div>
            </Card>

            <Card variant="surface" className="space-y-4">
              <h2 className="section-title">Transcript</h2>
              <div className="grid gap-2">
                {thread.messages.map((message) => (
                  <article key={message.id} className={"rounded-xl border border-line p-3 " + (message.direction === "OUTBOUND" ? "bg-primary/5" : "bg-surface-elevated")}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-subtle">
                      <span>{message.channel} · {message.direction}</span>
                      <span>{formatDate(message.createdAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{message.body}</p>
                    {message.attachments.length ? <p className="mt-2 text-xs text-ink-subtle">Attachments: {message.attachments.map((attachment) => attachment.fileName ?? attachment.mediaType).join(", ")}</p> : null}
                  </article>
                ))}
                {!thread.messages.length ? <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-muted">No messages linked to this sales thread yet.</p> : null}
              </div>
            </Card>
          </div>

          <aside className="grid gap-5 content-start">
            <Card variant="surface" className="space-y-4">
              <h2 className="section-title">Pipeline controls</h2>
              <form action={advanceStageAction} className="grid gap-3">
                <CsrfField />
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="threadId" value={thread.id} />
                <label className="grid gap-1 text-sm font-medium text-ink">
                  Move to stage
                  <select name="toStageKey" defaultValue={thread.stage.key} className="rounded-xl border border-line bg-surface-elevated px-3 py-2 text-sm text-ink">
                    {stages.map((stage) => <option key={stage.id} value={stage.key}>{stage.label}</option>)}
                  </select>
                </label>
                <SubmitButton variant="secondary">Advance stage</SubmitButton>
              </form>
              <form action={setThreadStatusAction} className="grid gap-3">
                <CsrfField />
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="threadId" value={thread.id} />
                <label className="grid gap-1 text-sm font-medium text-ink">
                  Status
                  <select name="status" defaultValue={thread.status} className="rounded-xl border border-line bg-surface-elevated px-3 py-2 text-sm text-ink">
                    {Object.values(SalesThreadStatus).map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <SubmitButton variant="secondary">Update status</SubmitButton>
              </form>
            </Card>

            <Card variant="surface" className="space-y-4">
              <header className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary-action" />
                <h2 className="section-title">Follow-up approval</h2>
              </header>
              {approvals.map((task) => (
                <div key={task.id} className="rounded-xl border border-line bg-surface-elevated p-3">
                  <Chip variant="warning" size="sm">{task.channel} draft</Chip>
                  <form action={approveFollowUpAction} className="mt-3 grid gap-3">
                    <CsrfField />
                    <input type="hidden" name="businessId" value={businessId} />
                    <input type="hidden" name="threadId" value={thread.id} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <Textarea name="body" label="Draft" rows={8} defaultValue={task.aiDraftBody ?? ""} required />
                    <SubmitButton variant="primary">Approve and send</SubmitButton>
                  </form>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <form action={snoozeFollowUpAction} className="grid gap-2">
                      <CsrfField />
                      <input type="hidden" name="businessId" value={businessId} />
                      <input type="hidden" name="threadId" value={thread.id} />
                      <input type="hidden" name="taskId" value={task.id} />
                      <Input name="dueAt" label="Snooze until" type="datetime-local" required />
                      <SubmitButton variant="secondary">Snooze</SubmitButton>
                    </form>
                    <form action={skipFollowUpAction} className="self-end">
                      <CsrfField />
                      <input type="hidden" name="businessId" value={businessId} />
                      <input type="hidden" name="threadId" value={thread.id} />
                      <input type="hidden" name="taskId" value={task.id} />
                      <SubmitButton variant="secondary">Skip</SubmitButton>
                    </form>
                  </div>
                </div>
              ))}
              {!approvals.length ? <p className="text-sm text-ink-muted">No AI follow-up draft is awaiting approval for this thread.</p> : null}
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
