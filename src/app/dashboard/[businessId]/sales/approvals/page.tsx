import { FollowUpStatus, StaffRole } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { approveFollowUpAction, skipFollowUpAction, snoozeFollowUpAction } from "@/app/dashboard/[businessId]/sales/actions";
import { CsrfField } from "@/components/security/csrf-field";
import { Chip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import { requirePaidBusinessPlan } from "@/server/services/billing.service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ businessId: string }>;
};

export default async function SalesApprovalsPage({ params }: PageProps) {
  const { businessId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(("/sign-in?callbackUrl=/dashboard/" + businessId + "/sales/approvals") as never);
  await requireRole({ businessId, userId: session.user.id, allowedRoles: [StaffRole.STAFF] });
  try {
    await requirePaidBusinessPlan(businessId, "Sales pipeline");
  } catch {
    redirect(("/dashboard/" + businessId + "/settings/billing?sales=upgrade") as never);
  }

  const business = await prisma.business.findFirst({
    where: { id: businessId, staffMembers: { some: { userId: session.user.id } } },
    select: { id: true, name: true }
  });
  if (!business) notFound();

  const tasks = await prisma.followUpTask.findMany({
    where: { businessId, status: FollowUpStatus.AWAITING_APPROVAL },
    include: { salesThread: { include: { stage: true, membership: { include: { user: true } } } } },
    orderBy: { updatedAt: "asc" },
    take: 100
  });

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <div className="grid gap-5">
        <Card variant="hero" className="px-6 py-7 sm:px-10">
          <Chip variant="primary" className="border-white/20 bg-white/15 text-white">{business.name} · Sales approvals</Chip>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Follow-ups awaiting approval</h1>
          <p className="mt-2 max-w-2xl text-white/85">Review, edit, approve, snooze, or skip AI-drafted follow-ups before any customer message is sent.</p>
        </Card>

        <div className="grid gap-3">
          {tasks.map((task) => (
            <Card key={task.id} variant="surface" className="space-y-4">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={("/dashboard/" + businessId + "/sales/" + task.salesThreadId) as never} className="font-display text-lg font-semibold text-primary-action">
                    {task.salesThread.title}
                  </Link>
                  <p className="mt-1 text-sm text-ink-muted">{task.salesThread.membership?.user.name ?? task.salesThread.contactPhone} · {task.salesThread.stage.label}</p>
                </div>
                <Chip variant="warning"><Sparkles className="h-3.5 w-3.5" /> {task.channel}</Chip>
              </header>
              <form action={approveFollowUpAction} className="grid gap-3">
                <CsrfField />
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="threadId" value={task.salesThreadId} />
                <input type="hidden" name="taskId" value={task.id} />
                <Textarea name="body" label="Draft" rows={6} defaultValue={task.aiDraftBody ?? ""} required />
                <SubmitButton variant="primary">Approve and send</SubmitButton>
              </form>
              <div className="grid gap-2 sm:grid-cols-2">
                <form action={snoozeFollowUpAction} className="grid gap-2">
                  <CsrfField />
                  <input type="hidden" name="businessId" value={businessId} />
                  <input type="hidden" name="threadId" value={task.salesThreadId} />
                  <input type="hidden" name="taskId" value={task.id} />
                  <Input name="dueAt" label="Snooze until" type="datetime-local" required />
                  <SubmitButton variant="secondary">Snooze</SubmitButton>
                </form>
                <form action={skipFollowUpAction} className="self-end">
                  <CsrfField />
                  <input type="hidden" name="businessId" value={businessId} />
                  <input type="hidden" name="threadId" value={task.salesThreadId} />
                  <input type="hidden" name="taskId" value={task.id} />
                  <SubmitButton variant="secondary">Skip</SubmitButton>
                </form>
              </div>
            </Card>
          ))}
          {!tasks.length ? <Card variant="surface" className="text-sm text-ink-muted">No follow-up drafts are awaiting approval.</Card> : null}
        </div>
      </div>
    </main>
  );
}
