import { Prisma } from "@prisma/client";

import { withBusinessScope } from "@/lib/prisma";
import type { SegmentRules } from "@/lib/segments";

export type { SegmentRule, SegmentRules } from "@/lib/segments";

// Column identifiers are hardcoded here — never derived from user input.
// Keys must stay in sync with SEGMENT_FIELDS in `@/lib/segments`.
const FIELD_MAP: Record<string, string> = {
  pointsBalance: 'm."pointsBalance"',
  tier: 't."name"',
  joinChannel: 'm."joinChannel"::text',
  province: 'b."province"::text',
  totalSpent: 'm."totalPointsEarned"',
  lastVisitDaysAgo: 'EXTRACT(DAY FROM NOW() - m."lastPointsEarnedAt")',
  visitCount: 'm."transactionCount"'
};

function buildSegmentConditions(rules: SegmentRules): Prisma.Sql[] {
  return rules.rules
    .map((rule): Prisma.Sql | null => {
      const fieldIdentifier = FIELD_MAP[rule.field];
      if (!fieldIdentifier) return null;
      // Prisma.raw is safe here: fieldIdentifier comes from the hardcoded FIELD_MAP above.
      const col = Prisma.raw(fieldIdentifier);
      switch (rule.operator) {
        case "eq":
          return Prisma.sql`${col} = ${String(rule.value)}`;
        case "not_eq":
          return Prisma.sql`${col} != ${String(rule.value)}`;
        case "gte": {
          const n = Number(rule.value);
          return isNaN(n) ? null : Prisma.sql`${col} >= ${n}`;
        }
        case "lte": {
          const n = Number(rule.value);
          return isNaN(n) ? null : Prisma.sql`${col} <= ${n}`;
        }
        case "gt": {
          const n = Number(rule.value);
          return isNaN(n) ? null : Prisma.sql`${col} > ${n}`;
        }
        case "lt": {
          const n = Number(rule.value);
          return isNaN(n) ? null : Prisma.sql`${col} < ${n}`;
        }
        default:
          return null;
      }
    })
    .filter((c): c is Prisma.Sql => c !== null);
}

export async function listSegments(businessId: string) {
  return withBusinessScope(businessId, (tx) =>
    tx.customerSegment.findMany({
      where: { businessId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        rules: true,
        createdAt: true
      }
    })
  );
}

export async function getSegmentMemberCount(
  businessId: string,
  rules: SegmentRules
): Promise<number> {
  const conditions = buildSegmentConditions(rules);
  const whereClause =
    conditions.length === 0
      ? Prisma.sql`TRUE`
      : Prisma.join(conditions, rules.matchAll ? " AND " : " OR ");

  const result = await withBusinessScope(businessId, async (tx) => {
    return tx.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT m."id")::bigint as count
      FROM "Membership" m
      JOIN "Business" b ON b."id" = m."businessId"
      LEFT JOIN "LoyaltyTier" t ON t."id" = m."tierId"
      WHERE m."businessId" = ${businessId}
        AND m."isActive" = true
        AND (${whereClause})`;
  });

  return Number(result[0]?.count ?? 0);
}

export async function createSegment(input: {
  businessId: string;
  name: string;
  description?: string;
  rules: SegmentRules;
}) {
  return withBusinessScope(input.businessId, (tx) =>
    tx.customerSegment.create({
      data: {
        businessId: input.businessId,
        name: input.name,
        description: input.description ?? null,
        rules: input.rules as unknown as Record<string, unknown>
      }
    })
  );
}

export async function deleteSegment(segmentId: string, businessId: string) {
  return withBusinessScope(businessId, (tx) =>
    tx.customerSegment.updateMany({
      where: { id: segmentId, businessId },
      data: { isActive: false }
    })
  );
}
