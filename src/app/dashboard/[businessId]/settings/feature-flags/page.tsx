import { StaffRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { CsrfField } from "@/components/security/csrf-field";
import { Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { withUserScope } from "@/lib/prisma";
import { hasStaffRoleAccess } from "@/lib/staff";
import { listBusinessFeatureFlags } from "@/server/services/feature-flag.service";

import { updateFeatureFlagAction } from "./actions";

export const dynamic = "force-dynamic";

type FeatureFlagsPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ updated?: string; reason?: string }>;
};

export default async function FeatureFlagsPage({
  params,
  searchParams
}: FeatureFlagsPageProps) {
  const { businessId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/feature-flags`);
  }

  const staffRecord = await withUserScope(session.user.id, (tx) =>
    tx.staffMember.findUnique({
      where: {
        businessId_userId: {
          businessId,
          userId: session.user.id
        }
      },
      include: {
        business: { select: { name: true } }
      }
    })
  );

  if (!staffRecord) notFound();

  const canManage = hasStaffRoleAccess(staffRecord.role, [StaffRole.OWNER]);
  const flags = canManage
    ? await listBusinessFeatureFlags({ businessId })
    : [];

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8 space-y-6">
      <div>
        <p className="eyebrow">Release controls</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
          {staffRecord.business.name} feature flags
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Dark-launch native communications and channel controls per business.
          Production defaults stay conservative until rollout validation is complete.
        </p>
      </div>

      {resolvedSearchParams.updated === "1" ? (
        <p className="rounded-lg border border-eco-green/30 bg-eco-green/5 px-3 py-2 text-sm text-eco-green">
          Feature flag updated.
        </p>
      ) : null}
      {resolvedSearchParams.updated === "error" ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {resolvedSearchParams.reason ?? "Could not update feature flag."}
        </p>
      ) : null}

      {!canManage ? (
        <Card variant="surface">
          <CardHeader
            title="Owner access required"
            description="Only business owners can change dark-launch feature flags."
          />
        </Card>
      ) : (
        <div className="grid gap-4">
          {flags.map((flag) => (
            <Card key={flag.key} variant="surface" className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-semibold text-ink">
                      {flag.label}
                    </h2>
                    <Chip variant={flag.enabled ? "success" : "warning"} size="sm">
                      {flag.enabled ? "Enabled" : "Disabled"}
                    </Chip>
                    {flag.overrideEnabled === null ? (
                      <Chip variant="default" size="sm">
                        Default
                      </Chip>
                    ) : (
                      <Chip variant="primary" size="sm">
                        Business override
                      </Chip>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{flag.description}</p>
                  {flag.updatedAt ? (
                    <p className="mt-1 text-xs text-ink-subtle">
                      Last changed {flag.updatedAt.toLocaleString("en-ZA")}
                    </p>
                  ) : null}
                </div>
                <form action={updateFeatureFlagAction} className="flex items-center gap-3">
                  <CsrfField />
                  <input type="hidden" name="businessId" value={businessId} />
                  <input type="hidden" name="key" value={flag.key} />
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                    <input
                      type="checkbox"
                      name="isEnabled"
                      defaultChecked={flag.enabled}
                      className="h-4 w-4 rounded border-line text-primary-action"
                    />
                    Enabled
                  </label>
                  <Button type="submit" variant="secondary" size="sm">
                    Save
                  </Button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
