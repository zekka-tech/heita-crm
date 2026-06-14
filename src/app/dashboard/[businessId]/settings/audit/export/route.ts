import { type NextRequest, NextResponse } from "next/server";
import { StaffRole } from "@prisma/client";

import { auth } from "@/lib/auth";
import { hasStaffRoleAccess } from "@/lib/staff";
import { withBusinessScope } from "@/lib/prisma";
import { exportAuditLogsCsv } from "@/server/services/staff-audit-ui.service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ businessId: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  const { businessId } = await context.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staffRecord = await withBusinessScope(businessId, (tx) => {
    return (tx as unknown as {
      staffMember: {
        findUnique: (args: unknown) => Promise<{ role: string } | null>;
      };
    }).staffMember.findUnique({
      where: {
        businessId_userId: {
          businessId,
          userId: session.user!.id
        }
      },
      select: { role: true }
    });
  });

  if (!staffRecord) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowedRoles: StaffRole[] = [
    StaffRole.OWNER,
    StaffRole.MANAGER,
    StaffRole.FRANCHISE_ADMIN
  ];

  if (!hasStaffRoleAccess(staffRecord.role as StaffRole, allowedRoles)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const actorUserId = sp.get("actorUserId") ?? undefined;
  const targetUserId = sp.get("targetUserId") ?? undefined;
  const action = sp.get("action") ?? undefined;
  const fromStr = sp.get("from");
  const toStr = sp.get("to");

  const csv = await exportAuditLogsCsv({
    businessId,
    actorUserId,
    targetUserId,
    action,
    from: fromStr ? new Date(fromStr) : undefined,
    to: toStr ? new Date(toStr) : undefined
  });

  const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
