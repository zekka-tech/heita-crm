import { WebSourceStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { enqueueWebCrawlJob } from "@/lib/ai/web-crawl-queue";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { constantTimeEqual } from "@/lib/security";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_RUN = 50;

function isAuthorized(request: Request): boolean {
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.CRON_SECRET;
  if (!provided || !expected) return false;
  return constantTimeEqual(provided, expected);
}

/**
 * Re-crawl web sources whose refresh interval has elapsed. Unchanged pages are
 * skipped during the crawl (contentHash), so re-runs are cheap. Idempotent:
 * sources already CRAWLING are excluded.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const candidates = await prisma.webSource.findMany({
    where: {
      refreshIntervalDays: { gt: 0 },
      status: { not: WebSourceStatus.CRAWLING }
    },
    select: { id: true, refreshIntervalDays: true, lastCrawledAt: true },
    orderBy: { lastCrawledAt: { sort: "asc", nulls: "first" } },
    take: 200
  });

  const due = candidates.filter((source) => {
    if (!source.lastCrawledAt) return true;
    return now - source.lastCrawledAt.getTime() >= source.refreshIntervalDays * DAY_MS;
  });

  let enqueued = 0;
  for (const source of due.slice(0, MAX_PER_RUN)) {
    try {
      await enqueueWebCrawlJob(source.id);
      enqueued += 1;
    } catch (error) {
      logger.error({ err: error, webSourceId: source.id }, "cron.refresh_web_sources.enqueue_failed");
    }
  }

  logger.info({ due: due.length, enqueued }, "cron.refresh_web_sources.completed");
  return NextResponse.json({ ok: true, due: due.length, enqueued });
}
