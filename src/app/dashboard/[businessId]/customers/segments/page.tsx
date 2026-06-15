import { StaffRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { withUserScope } from "@/lib/prisma";
import { hasStaffRoleAccess } from "@/lib/staff";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CsrfField } from "@/components/security/csrf-field";
import { SegmentBuilder } from "@/components/segments/segment-builder";
import {
  listSegments,
  getSegmentMemberCount,
  type SegmentRules
} from "@/server/services/segment.service";

import { createSegmentAction, deleteSegmentAction } from "./actions";

const PREDEFINED_SEGMENTS = [
  {
    name: "At-risk customers",
    description: "Haven't visited in 30+ days",
    rules: {
      rules: [{ field: "lastVisitDaysAgo", operator: "gt", value: 30 }],
      matchAll: true
    }
  },
  {
    name: "Top spenders",
    description: "Earned 500+ points total",
    rules: {
      rules: [{ field: "totalSpent", operator: "gte", value: 500 }],
      matchAll: true
    }
  },
  {
    name: "Gold tier members",
    description: "Currently at Gold tier",
    rules: {
      rules: [{ field: "tier", operator: "eq", value: "Gold" }],
      matchAll: true
    }
  }
] as const;

export default async function SegmentsPage({
  params,
  searchParams
}: {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ segment?: string; reason?: string }>;
}) {
  const { businessId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const staffRecord = await withUserScope(session.user.id, (tx) =>
    tx.staffMember.findUnique({
      where: { businessId_userId: { businessId, userId: session.user.id } },
      select: { role: true }
    })
  );
  const canManage = staffRecord
    ? hasStaffRoleAccess(staffRecord.role, [StaffRole.OWNER, StaffRole.MANAGER])
    : false;

  const segments = await listSegments(businessId).catch(() => []);

  // Fetch member counts for saved and predefined segments in parallel
  const [savedCounts, predefinedCounts] = await Promise.all([
    Promise.all(
      segments.map((seg) =>
        getSegmentMemberCount(businessId, seg.rules as unknown as SegmentRules).catch(
          () => null as number | null
        )
      )
    ),
    Promise.all(
      PREDEFINED_SEGMENTS.map((seg) =>
        getSegmentMemberCount(businessId, seg.rules as unknown as SegmentRules).catch(
          () => null as number | null
        )
      )
    )
  ]);

  const status = resolvedSearchParams.segment;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customer Segments</h1>
        <p className="text-muted-foreground mt-1">
          Group customers by behaviour for targeted promotions and campaigns.
        </p>
      </div>

      {status === "created" || status === "deleted" ? (
        <p className="rounded-lg border border-eco-green/30 bg-eco-green/5 px-3 py-2 text-sm text-eco-green">
          {status === "created" ? "Segment created." : "Segment deleted."}
        </p>
      ) : null}
      {status === "error" ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {resolvedSearchParams.reason ?? "Could not update segments."}
        </p>
      ) : null}

      {segments.length > 0 && (
        <div className="grid gap-4">
          {segments.map((segment, idx) => (
            <Card key={segment.id} variant="surface">
              <div className="flex items-start justify-between gap-4 pr-4">
                <CardHeader
                  title={segment.name}
                  description={segment.description ?? undefined}
                />
                {canManage ? (
                  <form action={deleteSegmentAction} className="pt-6">
                    <CsrfField />
                    <input type="hidden" name="businessId" value={businessId} />
                    <input type="hidden" name="segmentId" value={segment.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Delete
                    </Button>
                  </form>
                ) : null}
              </div>
              <div className="px-6 pb-4">
                <pre className="text-xs text-muted-foreground bg-muted rounded p-2 overflow-x-auto">
                  {JSON.stringify(segment.rules, null, 2)}
                </pre>
                {savedCounts[idx] !== null && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {savedCounts[idx]!.toLocaleString()} members
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {canManage ? (
        <Card variant="surface">
          <CardHeader
            title="Create a segment"
            description="Define rules to group customers. Match all rules (AND) or any rule (OR)."
          />
          <form action={createSegmentAction} className="space-y-4 px-6 pb-6">
            <CsrfField />
            <input type="hidden" name="businessId" value={businessId} />
            <Input name="name" label="Segment name" placeholder="e.g. Weekend regulars" required />
            <Input name="description" label="Description (optional)" placeholder="Who this segment is for" />
            <SegmentBuilder />
            <Button type="submit" variant="primary">
              Create segment
            </Button>
          </form>
        </Card>
      ) : null}

      <Card variant="outline">
        <CardHeader
          title="Quick segments"
          description={
            canManage
              ? "Pre-built segments — apply one to save it to your business."
              : "Pre-built segments you can use for targeted campaigns."
          }
        />
        <div className="px-6 pb-6 grid gap-4 md:grid-cols-3">
          {PREDEFINED_SEGMENTS.map((segment, idx) => (
            <Card key={segment.name} variant="surface" className="p-4">
              <h3 className="font-semibold text-sm">{segment.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {segment.description}
              </p>
              <pre className="text-xs text-muted-foreground bg-muted rounded p-2 mt-2 overflow-x-auto">
                {JSON.stringify(segment.rules, null, 2)}
              </pre>
              {predefinedCounts[idx] !== null && (
                <p className="text-xs text-muted-foreground mt-2">
                  ~{predefinedCounts[idx]!.toLocaleString()} estimated members
                </p>
              )}
              {canManage ? (
                <form action={createSegmentAction} className="mt-3">
                  <CsrfField />
                  <input type="hidden" name="businessId" value={businessId} />
                  <input type="hidden" name="name" value={segment.name} />
                  <input type="hidden" name="description" value={segment.description} />
                  <input
                    type="hidden"
                    name="rules"
                    value={JSON.stringify(segment.rules)}
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    Apply
                  </Button>
                </form>
              ) : null}
            </Card>
          ))}
        </div>
      </Card>
    </div>
  );
}
