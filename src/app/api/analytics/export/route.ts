import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { generateAnonymisedBasketReport } from "@/server/services/analytics-export.service";

const BASKET_REPORT_SECRET = process.env.BASKET_REPORT_SECRET;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const isAuthenticated = (() => {
    if (BASKET_REPORT_SECRET) {
      const header = request.headers.get("authorization");
      if (header?.startsWith("Bearer ") && header.slice(7) === BASKET_REPORT_SECRET) {
        return true;
      }
    }
    return false;
  })();

  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    identifier: "analytics:export",
    windowSeconds: 300,
    max: 5
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const format = request.nextUrl.searchParams.get("format") ?? "json";
    const days = parseInt(request.nextUrl.searchParams.get("days") ?? "90", 10);
    const report = await generateAnonymisedBasketReport(Math.min(days, 365));

    if (format === "csv") {
      const headers = [
        "period", "province", "category", "totalTransactions",
        "totalPointsEarned", "totalPointsRedeemed", "avgTransactionValue"
      ];
      const rows = report.map((r) =>
        [r.period, r.province, r.category, r.totalTransactions,
          r.totalPointsEarned, r.totalPointsRedeemed, r.avgTransactionValue].join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="heita-basket-report-${days}d.csv"`
        }
      });
    }

    const businessCount = await prisma.business.count({
      where: { deletedAt: null, isActive: true }
    });

    const memberCount = await prisma.membership.count({
      where: { isActive: true }
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      periodDays: days,
      totalBusinesses: businessCount,
      totalMembers: memberCount,
      rows: report
    });
  } catch (error) {
    logger.error({ err: error }, "analytics.export.failed");
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}
