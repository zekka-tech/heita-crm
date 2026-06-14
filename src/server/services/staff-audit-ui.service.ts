import { withBusinessScope } from "@/lib/prisma";

export type AuditLogParams = {
  businessId: string;
  actorUserId?: string;
  targetUserId?: string;
  action?: string;
  from?: Date;
  to?: Date;
};

export type PaginatedAuditLogParams = AuditLogParams & {
  cursor?: string;
  limit?: number;
};

export type AuditLogRow = {
  id: string;
  businessId: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  createdAt: Date;
  actorUser: {
    id: string;
    name: string | null;
    email: string | null;
    staffMemberships: { role: string }[];
  } | null;
};

export type PaginatedAuditLogs = {
  rows: AuditLogRow[];
  nextCursor: string | null;
};

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const CSV_MAX_ROWS = 10_000;

function buildWhere(params: AuditLogParams) {
  const where: Record<string, unknown> = { businessId: params.businessId };

  if (params.actorUserId) {
    where.actorUserId = params.actorUserId;
  }

  if (params.targetUserId) {
    where.targetId = params.targetUserId;
  }

  if (params.action) {
    where.action = params.action;
  }

  if (params.from ?? params.to) {
    const createdAt: Record<string, Date> = {};
    if (params.from) createdAt.gte = params.from;
    if (params.to) createdAt.lte = params.to;
    where.createdAt = createdAt;
  }

  return where;
}

export async function getAuditLogs(
  params: PaginatedAuditLogParams
): Promise<PaginatedAuditLogs> {
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const where = buildWhere(params);

  if (params.cursor) {
    (where as Record<string, unknown>).id = { lt: params.cursor };
  }

  const rows = await withBusinessScope(params.businessId, (tx) => {
    return (tx as unknown as {
      staffAuditLog: {
        findMany: (args: unknown) => Promise<AuditLogRow[]>;
      };
    }).staffAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      include: {
        actorUser: {
          select: {
            id: true,
            name: true,
            email: true,
            staffMemberships: {
              where: { businessId: params.businessId },
              select: { role: true },
              take: 1
            }
          }
        }
      }
    });
  });

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  const nextCursor = hasMore && rows.length > 0 ? rows[rows.length - 1]?.id ?? null : null;

  return { rows, nextCursor };
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportAuditLogsCsv(params: AuditLogParams): Promise<string> {
  const where = buildWhere(params);

  const rows = await withBusinessScope(params.businessId, (tx) => {
    return (tx as unknown as {
      staffAuditLog: {
        findMany: (args: unknown) => Promise<AuditLogRow[]>;
      };
    }).staffAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: CSV_MAX_ROWS,
      include: {
        actorUser: {
          select: {
            id: true,
            name: true,
            email: true,
            staffMemberships: {
              where: { businessId: params.businessId },
              select: { role: true },
              take: 1
            }
          }
        }
      }
    });
  });

  const header = [
    "id",
    "createdAt",
    "actorUserId",
    "actorName",
    "actorEmail",
    "actorRole",
    "action",
    "targetType",
    "targetId",
    "metadata"
  ].join(",");

  const csvRows = rows.map((row) => {
    const actorRole = row.actorUser?.staffMemberships?.[0]?.role ?? "";
    return [
      escapeCell(row.id),
      escapeCell(row.createdAt.toISOString()),
      escapeCell(row.actorUserId),
      escapeCell(row.actorUser?.name),
      escapeCell(row.actorUser?.email),
      escapeCell(actorRole),
      escapeCell(row.action),
      escapeCell(row.targetType),
      escapeCell(row.targetId),
      escapeCell(row.metadata != null ? JSON.stringify(row.metadata) : "")
    ].join(",");
  });

  return [header, ...csvRows].join("\n");
}
