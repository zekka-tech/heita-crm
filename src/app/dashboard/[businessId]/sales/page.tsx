import { MessageChannel, SalesThreadStatus, StaffRole } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BriefcaseBusiness, Clock, Plus } from "lucide-react";

import { createSalesThreadAction } from "@/app/dashboard/[businessId]/sales/actions";
import { CsrfField } from "@/components/security/csrf-field";
import { Chip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import { listPipelineStages, listThreads } from "@/server/services/sales-thread.service";

export const dynamic = "force-dynamic";

type SalesPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ updated?: string }>;
};

function formatMoney(value: unknown) {
  if (value == null) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);
}

export default async function SalesPage({ params, searchParams }: SalesPageProps) {
  const { businessId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const session = await auth();
  if (!session?.user?.id) redirect(("/sign-in?callbackUrl=/dashboard/" + businessId + "/sales") as never);

  await requireRole({ businessId, userId: session.user.id, allowedRoles: [StaffRole.STAFF] });
  const business = await prisma.business.findFirst({
    where: { id: businessId, staffMembers: { some: { userId: session.user.id } } },
    select: { id: true, name: true }
  });
  if (!business) notFound();

  const [stages, threads, memberships] = await Promise.all([
    listPipelineStages(businessId),
    listThreads({ businessId, status: SalesThreadStatus.OPEN }),
    prisma.membership.findMany({
      where: { businessId, isActive: true },
      include: { user: { select: { id: true, name: true, phone: true, email: true } } },
      orderBy: { joinedAt: "desc" },
      take: 100
    })
  ]);

  const threadsByStage = new Map(stages.map((stage) => [stage.id, threads.filter((thread) => thread.stageId === stage.id)]));

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <div className="grid gap-5">
        <Card variant="hero" className="px-6 py-7 sm:px-10">
          <Chip variant="primary" className="border-white/20 bg-white/15 text-white">{business.name} · Sales</Chip>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Sales pipeline</h1>
          <p className="mt-2 max-w-2xl text-white/85">Attach quotes, invoices, orders, or POs to customer threads, send them across channels, and review AI follow-up drafts before anything goes out.</p>
        </Card>

        {resolvedSearchParams.updated ? <Card variant="surface" className="text-sm text-success">Sales thread updated.</Card> : null}

        <Card variant="surface" className="space-y-4">
          <header className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary-action" />
            <h2 className="section-title">Create sales thread</h2>
          </header>
          <form action={createSalesThreadAction} className="grid gap-3 md:grid-cols-2">
            <CsrfField />
            <input type="hidden" name="businessId" value={business.id} />
            <Input name="title" label="Thread title" placeholder="Quote for catering order" required className="md:col-span-2" />
            <label className="grid gap-1 text-sm font-medium text-ink">
              Existing member
              <select name="membershipId" className="rounded-xl border border-line bg-surface-elevated px-3 py-2 text-sm text-ink">
                <option value="">Use phone number instead</option>
                {memberships.map((membership) => (
                  <option key={membership.id} value={membership.id}>{membership.user.name ?? membership.user.phone ?? membership.user.email ?? membership.id}</option>
                ))}
              </select>
            </label>
            <Input name="contactPhone" label="Contact phone" placeholder="+27821234567" />
            <label className="grid gap-1 text-sm font-medium text-ink">
              Stage
              <select name="stageKey" className="rounded-xl border border-line bg-surface-elevated px-3 py-2 text-sm text-ink">
                {stages.filter((stage) => !stage.isTerminal).map((stage) => <option key={stage.id} value={stage.key}>{stage.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink">
              Preferred channel
              <select name="preferredChannel" defaultValue={MessageChannel.WHATSAPP} className="rounded-xl border border-line bg-surface-elevated px-3 py-2 text-sm text-ink">
                {[MessageChannel.WHATSAPP, MessageChannel.IN_APP, MessageChannel.EMAIL, MessageChannel.SMS].map((channel) => <option key={channel} value={channel}>{channel}</option>)}
              </select>
            </label>
            <Input name="valueZar" label="Value (ZAR)" type="number" min="0" step="0.01" />
            <SubmitButton variant="primary" className="md:col-span-2">Create thread</SubmitButton>
          </form>
        </Card>

        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[960px] grid-cols-4 gap-3 xl:grid-cols-6 2xl:grid-cols-11">
            {stages.map((stage) => {
              const stageThreads = threadsByStage.get(stage.id) ?? [];
              return (
                <section key={stage.id} className="rounded-xl border border-line bg-surface p-3">
                  <header className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-ink">{stage.label}</h2>
                    <Chip variant={stage.isTerminal ? "success" : "primary"} size="sm">{stageThreads.length}</Chip>
                  </header>
                  <div className="grid gap-2">
                    {stageThreads.map((thread) => (
                      <Link key={thread.id} href={("/dashboard/" + business.id + "/sales/" + thread.id) as never} className="block rounded-lg border border-line bg-surface-elevated p-3 transition hover:border-primary-action">
                        <div className="flex items-start gap-2">
                          <BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-primary-action" />
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-ink">{thread.title}</h3>
                            <p className="mt-1 truncate text-xs text-ink-muted">{thread.membership?.user.name ?? thread.contactPhone}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-1 text-xs text-ink-subtle">
                          {formatMoney(thread.valueZar) ? <Chip size="sm" variant="default">{formatMoney(thread.valueZar)}</Chip> : null}
                          {thread.followUpTasks[0] ? <Chip size="sm" variant="warning"><Clock className="h-3 w-3" /> {thread.followUpTasks[0].status.replace(/_/g, " ")}</Chip> : null}
                        </div>
                      </Link>
                    ))}
                    {!stageThreads.length ? <p className="rounded-lg border border-dashed border-line p-3 text-xs text-ink-subtle">No open threads.</p> : null}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
