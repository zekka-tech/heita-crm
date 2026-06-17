import type { Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Building2, MapPin, Store, Users, Wallet } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { withBusinessScope } from "@/lib/prisma";
import {
  getFranchiseAggregateStats,
  getFranchiseChildBusinesses,
} from "@/server/services/franchise.service";

export const dynamic = "force-dynamic";

type FranchiseDashboardPageProps = {
  params: Promise<{ businessId: string }>;
};

export default async function FranchiseDashboardPage({
  params,
}: FranchiseDashboardPageProps) {
  const { businessId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/franchise`);
  }

  const userId = session.user.id;
  // Scoped read: the staffMembers authorization subquery is RLS-gated under the
  // app role (else null → 404). Staff access already enforced by the layout.
  const business = await withBusinessScope(businessId, (tx) =>
    tx.business.findFirst({
      where: {
        id: businessId,
        deletedAt: null,
        staffMembers: { some: { userId } },
      },
      select: { id: true, name: true, isFranchiseHQ: true, parentBusinessId: true },
    })
  );

  if (!business) {
    notFound();
  }

  if (!business.isFranchiseHQ) {
    return (
      <main className="px-4 pb-24 pt-6 sm:px-8">
        <Card variant="outline" className="max-w-lg mx-auto mt-12">
          <CardHeader
            title="Not a franchise headquarters"
            description="This business is not configured as a franchise HQ. Enable franchise mode in business settings to manage multiple locations."
          />
        </Card>
      </main>
    );
  }

  const [stats, children] = await Promise.all([
    getFranchiseAggregateStats(businessId),
    getFranchiseChildBusinesses(businessId),
  ]);

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <div className="grid gap-5">
        {/* Hero */}
        <Card variant="hero" className="px-6 py-7 sm:px-10">
          <Chip variant="primary" className="bg-white/15 text-white border-white/20">
            <Store className="h-3.5 w-3.5" />
            {business.name} · Franchise
          </Chip>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Franchise
          </h1>
          <p className="mt-2 max-w-2xl text-white/85">
            Aggregate view across all franchise locations. Manage child businesses,
            track membership growth, and monitor points liability in one place.
          </p>
        </Card>

        {/* Aggregate KPIs */}
        <section className="grid gap-3 sm:grid-cols-3">
          <Card variant="outline" className="space-y-2">
            <div className="flex items-center justify-between">
              <Store className="h-4 w-4 text-primary-action" />
              <span className="metric-label">Locations</span>
            </div>
            <p className="metric-value">{stats.locationCount}</p>
            <p className="text-[0.6875rem] text-ink-subtle">
              Active franchise locations
            </p>
          </Card>
          <Card variant="outline" className="space-y-2">
            <div className="flex items-center justify-between">
              <Users className="h-4 w-4 text-primary-action" />
              <span className="metric-label">Total Members</span>
            </div>
            <p className="metric-value">{stats.totalMembers.toLocaleString()}</p>
            <p className="text-[0.6875rem] text-ink-subtle">
              Across all locations
            </p>
          </Card>
          <Card variant="outline" className="space-y-2">
            <div className="flex items-center justify-between">
              <Wallet className="h-4 w-4 text-warning" />
              <span className="metric-label">Points Liability</span>
            </div>
            <p className="metric-value">
              {stats.totalPointsLiability.toLocaleString()}
            </p>
            <p className="text-[0.6875rem] text-ink-subtle">
              Outstanding balance
            </p>
          </Card>
        </section>

        {/* Child business list */}
        <Card variant="surface">
          <CardHeader
            title="Locations"
            description={`${children.length} franchise location${children.length === 1 ? "" : "s"}`}
          />
          <div className="mt-4">
            {children.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No child locations linked yet. Use the settings of each business to
                assign it to this franchise HQ.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {children.map((child) => (
                  <div
                    key={child.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/${child.id}` as Route}
                        className="font-medium hover:text-primary-action transition-colors truncate block"
                      >
                        <Building2 className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5 text-ink-muted" />
                        {child.name}
                      </Link>
                      <p className="text-xs text-ink-muted mt-0.5 flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {child.province.replace(/_/g, " ")}
                        </span>
                        <span>
                          {child._count.memberships} member
                          {child._count.memberships === 1 ? "" : "s"}
                        </span>
                      </p>
                    </div>
                    <span className="text-xs text-ink-muted font-mono ml-4 shrink-0">
                      {child.slug}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Link a location info */}
        <Card variant="outline">
          <CardHeader
            title="Link a location"
            description="Connect an existing business as a child location of this franchise."
          />
          <div className="mt-4">
            <p className="text-sm text-ink-muted">
              Use the business settings of the child location and set its parent
              business to{" "}
              <code className="bg-muted px-1 rounded text-xs font-mono">
                {businessId}
              </code>
              .
            </p>
          </div>
        </Card>
      </div>
    </main>
  );
}
