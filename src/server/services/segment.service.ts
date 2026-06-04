import { prisma } from "@/lib/prisma";

type SegmentRule = {
  field: string;
  operator: string;
  value: string | number;
};

type SegmentRules = {
  rules: SegmentRule[];
  matchAll: boolean;
};

const FIELD_MAP: Record<string, string> = {
  pointsBalance: 'm."pointsBalance"',
  tier: 't."name"',
  joinChannel: 'm."joinChannel"::text',
  province: 'b."province"::text',
  totalSpent: 'm."totalPointsEarned"',
  lastVisitDaysAgo: 'EXTRACT(DAY FROM NOW() - m."lastPointsEarnedAt")',
  visitCount: 'm."transactionCount"'
};

function buildSegmentWhere(rules: SegmentRules): string {
  const parts = rules.rules
    .map((rule) => {
      const field = FIELD_MAP[rule.field];
      if (!field) return null;
      switch (rule.operator) {
        case "eq": return `${field} = '${String(rule.value).replace(/'/g, "''")}'`;
        case "gte": return `${field} >= ${Number(rule.value)}`;
        case "lte": return `${field} <= ${Number(rule.value)}`;
        case "gt": return `${field} > ${Number(rule.value)}`;
        case "lt": return `${field} < ${Number(rule.value)}`;
        case "not_eq": return `${field} != '${String(rule.value).replace(/'/g, "''")}'`;
        default: return null;
      }
    })
    .filter((c): c is string => c !== null);

  if (parts.length === 0) {
    return "TRUE";
  }

  return parts.join(rules.matchAll ? " AND " : " OR ");
}

export async function listSegments(businessId: string) {
  return prisma.customerSegment.findMany({
    where: { businessId, isActive: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      rules: true,
      createdAt: true
    }
  });
}

export async function getSegmentMemberCount(
  businessId: string,
  rules: SegmentRules
): Promise<number> {
  const where = buildSegmentWhere(rules);

  const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(DISTINCT m."id")::bigint as count
     FROM "Membership" m
     JOIN "Business" b ON b."id" = m."businessId"
     LEFT JOIN "LoyaltyTier" t ON t."id" = m."tierId"
     WHERE m."businessId" = '${businessId}'
       AND m."isActive" = true
       AND (${where})`
  );

  return Number(result[0]?.count ?? 0);
}

export async function createSegment(input: {
  businessId: string;
  name: string;
  description?: string;
  rules: SegmentRules;
}) {
  return prisma.customerSegment.create({
    data: {
      businessId: input.businessId,
      name: input.name,
      description: input.description ?? null,
      rules: input.rules as unknown as Record<string, unknown>
    }
  });
}

export async function deleteSegment(segmentId: string, businessId: string) {
  return prisma.customerSegment.updateMany({
    where: { id: segmentId, businessId },
    data: { isActive: false }
  });
}
