import type { Route } from "next";
import Link from "next/link";
import { StaffRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { ClipboardList, ChevronRight } from "lucide-react";

import { Chip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { withBusinessScope } from "@/lib/prisma";
import { hasStaffRoleAccess } from "@/lib/staff";
import { getAuditLogs } from "@/server/services/staff-audit-ui.service";
import { ExportButton } from "./_components/export-button";

export const dynamic = "force-dynamic";

type AuditPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{
    actorUserId?: string;
    targetUserId?: string;
    action?: string;
    from?: string;
    to?: string;
    cursor?: string;
  }>;
};

const ALLOWED_ROLES: StaffRole[] = [
  StaffRole.OWNER,
  StaffRole.MANAGER,
  StaffRole.FRANCHISE_ADMIN
];

export default async function AuditLogPage({
  params,
  searchParams
}: AuditPageProps) {
  const { businessId } = await params;
  const sp = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/sign-in?callbackUrl=/dashboard/${businessId}/settings/audit`
    );
  }

  const staffRecord = await withBusinessScope(businessId, (tx) => {
    return (tx as unknown as {
      staffMember: {
        findUnique: (args: unknown) => Promise<{
          role: string;
          business: { name: string };
        } | null>;
      };
    }).staffMember.findUnique({
      where: {
        businessId_userId: {
          businessId,
          userId: session.user!.id
        }
      },
      include: {
        business: { select: { name: true } }
      }
    });
  });

  if (!staffRecord) notFound();

  if (!hasStaffRoleAccess(staffRecord.role as StaffRole, ALLOWED_ROLES)) {
    return (
      <main className="px-4 pb-24 pt-6 sm:px-8 space-y-6">
        <Card variant="surface" className="px-6 py-8 text-center">
          <p className="text-sm text-ink-muted">
            Audit log access is restricted to Owners, Managers, and Franchise
            Admins.
          </p>
        </Card>
      </main>
    );
  }

  const { rows, nextCursor } = await getAuditLogs({
    businessId,
    actorUserId: sp.actorUserId,
    targetUserId: sp.targetUserId,
    action: sp.action,
    from: sp.from ? new Date(sp.from) : undefined,
    to: sp.to ? new Date(sp.to) : undefined,
    cursor: sp.cursor,
    limit: 50
  });

  // Build a URL for "Load more" that preserves all existing search params.
  function buildLoadMoreHref() {
    if (!nextCursor) return null;
    const params = new URLSearchParams();
    if (sp.actorUserId) params.set("actorUserId", sp.actorUserId);
    if (sp.targetUserId) params.set("targetUserId", sp.targetUserId);
    if (sp.action) params.set("action", sp.action);
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    params.set("cursor", nextCursor);
    return `/dashboard/${businessId}/settings/audit?${params.toString()}` as Route;
  }

  const loadMoreHref = buildLoadMoreHref();

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-ink-muted" aria-label="Breadcrumb">
        <Link
          href={`/dashboard/${businessId}/settings` as Route}
          className="hover:text-primary-action transition-colors"
        >
          Settings
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="text-ink">Audit Log</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Chip variant="primary" className="mb-2">
            <ClipboardList className="h-3.5 w-3.5" />
            {staffRecord.business.name}
          </Chip>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            Staff Audit Log
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            A tamper-evident record of all staff actions. Use this for POPIA
            data subject requests and SOC 2 compliance reviews.
          </p>
        </div>

        <ExportButton
          businessId={businessId}
          actorUserId={sp.actorUserId}
          targetUserId={sp.targetUserId}
          action={sp.action}
          from={sp.from}
          to={sp.to}
        />
      </div>

      {/* Audit table */}
      <Card variant="surface" className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-wash">
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Timestamp
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Actor
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Action
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Target
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-ink-muted"
                  >
                    No audit log entries found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const actorName =
                    row.actorUser?.name ?? row.actorUser?.email ?? row.actorUserId ?? "System";
                  const actorRole =
                    row.actorUser?.staffMemberships?.[0]?.role ?? null;
                  const targetLabel = row.targetId
                    ? `${row.targetType} ${row.targetId}`
                    : row.targetType;
                  const metadataSummary =
                    row.metadata != null
                      ? JSON.stringify(row.metadata).slice(0, 120)
                      : null;

                  return (
                    <tr key={row.id} className="hover:bg-wash/50 transition-colors">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink-muted">
                        {row.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink">{actorName}</span>
                        {actorRole ? (
                          <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary-action">
                            {actorRole}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink">
                        {row.action}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {targetLabel}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-xs text-ink-muted">
                        {metadataSummary ? (
                          <span title={JSON.stringify(row.metadata)}>
                            {metadataSummary}
                            {metadataSummary.length >= 120 ? "…" : ""}
                          </span>
                        ) : (
                          <span className="text-ink-muted/50">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {loadMoreHref ? (
          <div className="border-t border-line px-4 py-3">
            <Link
              href={loadMoreHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-primary/30 hover:text-primary-action"
            >
              Load more
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
