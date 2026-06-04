import { auth } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { listSegments } from "@/server/services/segment.service";

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
  params
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  const session = await auth();

  if (!session) {
    redirect("/sign-in");
  }

  const segments = await listSegments(businessId).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customer Segments</h1>
        <p className="text-muted-foreground mt-1">
          Group customers by behaviour for targeted promotions and campaigns.
        </p>
      </div>

      {segments.length > 0 && (
        <div className="grid gap-4">
          {segments.map((segment) => (
            <Card key={segment.id} variant="surface">
              <CardHeader
                title={segment.name}
                description={segment.description ?? undefined}
              />
              <div className="px-6 pb-4">
                <pre className="text-xs text-muted-foreground bg-muted rounded p-2 overflow-x-auto">
                  {JSON.stringify(segment.rules, null, 2)}
                </pre>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card variant="outline">
        <CardHeader
          title="Quick segments"
          description="Pre-built segments you can use for targeted campaigns."
        />
        <div className="px-6 pb-6 grid gap-4 md:grid-cols-3">
          {PREDEFINED_SEGMENTS.map((segment) => (
            <Card key={segment.name} variant="surface" className="p-4">
              <h3 className="font-semibold text-sm">{segment.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {segment.description}
              </p>
              <pre className="text-xs text-muted-foreground bg-muted rounded p-2 mt-2 overflow-x-auto">
                {JSON.stringify(segment.rules, null, 2)}
              </pre>
            </Card>
          ))}
        </div>
      </Card>
    </div>
  );
}
