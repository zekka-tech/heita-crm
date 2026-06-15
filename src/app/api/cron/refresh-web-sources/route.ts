import { WebSourceStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { enqueueWebCrawlJob } from "@/lib/ai/web-crawl-queue";
import { logger } from "@/lib/logger";
import { prisma, withBusinessScope } from "@/lib/prisma";
import { constantTimeEqual } from "@/lib/security";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_RUN = 50;

type Candidate = {
  id: string;
  businessId: string;
  refreshIntervalDays: number;
  lastCrawledAt: Date | null;
};

function isAuthorized(request: Request): boolean {
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.CRON_SECRET;
  if (!provided || !expected) return false;
  return constantTimeEqual(provided, expected);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const businesses = await prisma.business.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true },
    take: 500
  });

  const due: Candidate[] = [];
  for (const business of businesses) {
    const candidates = await withBusinessScope(business.id, (tx) =>
      tx.webSource.findMany({
        where: {
          businessId: business.id,
          refreshIntervalDays: { gt: 0 },
          status: { not: WebSourceStatus.CRAWLING }
        },
        select: { id: true, businessId: true, refreshIntervalDays: true, lastCrawledAt: true },
        orderBy: { lastCrawledAt: { sort: "asc", nulls: "first" } },
        take: MAX_PER_RUN
      })
    );

    for (const source of candidates) {
      if (!source.lastCrawledAt || now - source.lastCrawledAt.getTime() >= source.refreshIntervalDays * DAY_MS) {
        due.push(source);
      }
    }
  }

  due.sort((a, b) => {
    if (!a.lastCrawledAt && !b.lastCrawledAt) return 0;
    if (!a.lastCrawledAt) return -1;
    if (!b.lastCrawledAt) return 1;
    return a.lastCrawledAt.getTime() - b.lastCrawledAt.getTime();
  });

  let enqueued = 0;
  for (const source of due.slice(0, MAX_PER_RUN)) {
    try {
      await enqueueWebCrawlJob(source.id, source.businessId);
      enqueued += 1;
    } catch (error) {
      logger.error({ err: error, webSourceId: source.id, businessId: source.businessId }, "cron.refresh_web_sources.enqueue_failed");
    }
  }

  logger.info({ due: due.length, enqueued }, "cron.refresh_web_sources.completed");
  return NextResponse.json({ ok: true, due: due.length, enqueued });
}
