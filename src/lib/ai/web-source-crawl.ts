import { createHash } from "node:crypto";

import { DocumentSourceType, DocumentStatus, WebSourceStatus } from "@prisma/client";

import { crawlSite } from "@/lib/ai/web-crawler";
import { enqueueDocumentIngestionJob } from "@/lib/ai/ingestion-queue";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { putStoredObject } from "@/lib/storage";

function pageStorageKey(input: { businessId: string; webSourceId: string; url: string }): string {
  const urlHash = createHash("sha1").update(input.url).digest("hex");
  return `businesses/${input.businessId}/web/${input.webSourceId}/${urlHash}.txt`;
}

/**
 * Crawl a WebSource, persist each page's extracted text as a `text/plain`
 * BusinessDocument (reusing the file ingestion pipeline), and enqueue embedding
 * only for new/changed pages (contentHash). Removes documents for pages that
 * disappeared. Updates the WebSource status/pageCount/lastCrawledAt.
 *
 * Never throws for individual page failures; throws only on a fatal crawl error
 * after marking the source FAILED, so the worker can retry/DLQ.
 */
export async function runWebSourceCrawl(webSourceId: string) {
  const source = await prisma.webSource.findUnique({ where: { id: webSourceId } });
  if (!source) {
    logger.warn({ webSourceId }, "crawler.source.missing");
    return { status: "missing" as const };
  }

  await prisma.webSource.update({
    where: { id: webSourceId },
    data: { status: WebSourceStatus.CRAWLING, errorMessage: null }
  });

  try {
    const result = await crawlSite({
      rootUrl: source.rootUrl,
      maxDepth: source.maxDepth,
      maxPages: source.maxPages
    });

    const seenKeys = new Set<string>();
    let changed = 0;

    for (const page of result.pages) {
      const storageKey = pageStorageKey({
        businessId: source.businessId,
        webSourceId: source.id,
        url: page.url
      });
      seenKeys.add(storageKey);

      const existing = await prisma.businessDocument.findUnique({
        where: { storageKey },
        select: { id: true, contentHash: true, status: true }
      });

      // Unchanged and already embedded → leave as-is (no re-fetch cost).
      if (existing && existing.contentHash === page.contentHash && existing.status === DocumentStatus.READY) {
        continue;
      }

      await putStoredObject({ key: storageKey, body: page.text, contentType: "text/plain" });

      const title = page.title?.slice(0, 160) || page.url.slice(0, 160);
      const sizeBytes = Buffer.byteLength(page.text, "utf8");

      const document = await prisma.businessDocument.upsert({
        where: { storageKey },
        create: {
          workspaceId: source.workspaceId,
          businessId: source.businessId,
          webSourceId: source.id,
          title,
          fileName: page.url,
          mimeType: "text/plain",
          storageKey,
          sizeBytes,
          sourceType: DocumentSourceType.URL,
          sourceUrl: page.url,
          contentHash: page.contentHash,
          status: DocumentStatus.PENDING
        },
        update: {
          title,
          sizeBytes,
          contentHash: page.contentHash,
          sourceUrl: page.url,
          status: DocumentStatus.PENDING,
          errorMessage: null
        }
      });

      await enqueueDocumentIngestionJob(document.id);
      changed += 1;
    }

    // Remove documents for pages that no longer exist (cascades chunks).
    const stale = await prisma.businessDocument.findMany({
      where: { webSourceId: source.id, storageKey: { notIn: [...seenKeys] } },
      select: { id: true }
    });
    if (stale.length > 0) {
      await prisma.businessDocument.deleteMany({
        where: { id: { in: stale.map((d) => d.id) } }
      });
    }

    await prisma.webSource.update({
      where: { id: webSourceId },
      data: {
        status: WebSourceStatus.READY,
        pageCount: result.pages.length,
        lastCrawledAt: new Date(),
        errorMessage: result.truncated
          ? `Crawl stopped at the page/time limit (${result.pages.length} pages).`
          : null
      }
    });

    logger.info(
      {
        webSourceId,
        businessId: source.businessId,
        pages: result.pages.length,
        changed,
        removed: stale.length,
        truncated: result.truncated
      },
      "crawler.source.ready"
    );

    return { status: "ready" as const, pages: result.pages.length, changed, removed: stale.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Crawl failed.";
    await prisma.webSource.update({
      where: { id: webSourceId },
      data: { status: WebSourceStatus.FAILED, errorMessage: message }
    });
    logger.error({ err: error, webSourceId, businessId: source.businessId }, "crawler.source.failed");
    throw error;
  }
}
