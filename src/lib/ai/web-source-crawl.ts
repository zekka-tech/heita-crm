import { createHash } from "node:crypto";

import { DocumentSourceType, DocumentStatus, WebSourceStatus } from "@prisma/client";

import { crawlSite } from "@/lib/ai/web-crawler";
import { enqueueDocumentIngestionJob } from "@/lib/ai/ingestion-queue";
import { logger } from "@/lib/logger";
import { withBusinessScope } from "@/lib/prisma";
import { putStoredObject } from "@/lib/storage";

function pageStorageKey(input: { businessId: string; webSourceId: string; url: string }): string {
  const urlHash = createHash("sha1").update(input.url).digest("hex");
  return `businesses/${input.businessId}/web/${input.webSourceId}/${urlHash}.txt`;
}

export async function runWebSourceCrawl(input: { webSourceId: string; businessId: string }) {
  const source = await withBusinessScope(input.businessId, (tx) =>
    tx.webSource.findUnique({ where: { id: input.webSourceId } })
  );
  if (!source) {
    logger.warn({ webSourceId: input.webSourceId, businessId: input.businessId }, "crawler.source.missing");
    return { status: "missing" as const };
  }

  await withBusinessScope(input.businessId, (tx) =>
    tx.webSource.update({
      where: { id: input.webSourceId },
      data: { status: WebSourceStatus.CRAWLING, errorMessage: null }
    })
  );

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

      const existing = await withBusinessScope(input.businessId, (tx) =>
        tx.businessDocument.findUnique({
          where: { storageKey },
          select: { id: true, contentHash: true, status: true }
        })
      );

      if (existing && existing.contentHash === page.contentHash && existing.status === DocumentStatus.READY) {
        continue;
      }

      await putStoredObject({ key: storageKey, body: page.text, contentType: "text/plain" });

      const title = page.title?.slice(0, 160) || page.url.slice(0, 160);
      const sizeBytes = Buffer.byteLength(page.text, "utf8");

      const document = await withBusinessScope(input.businessId, (tx) =>
        tx.businessDocument.upsert({
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
        })
      );

      await enqueueDocumentIngestionJob(document.id, source.businessId);
      changed += 1;
    }

    const stale = await withBusinessScope(input.businessId, (tx) =>
      tx.businessDocument.findMany({
        where: { webSourceId: source.id, storageKey: { notIn: [...seenKeys] } },
        select: { id: true }
      })
    );
    if (stale.length > 0) {
      await withBusinessScope(input.businessId, (tx) =>
        tx.businessDocument.deleteMany({
          where: { id: { in: stale.map((d) => d.id) } }
        })
      );
    }

    await withBusinessScope(input.businessId, (tx) =>
      tx.webSource.update({
        where: { id: input.webSourceId },
        data: {
          status: WebSourceStatus.READY,
          pageCount: result.pages.length,
          lastCrawledAt: new Date(),
          errorMessage: result.truncated
            ? `Crawl stopped at the page/time limit (${result.pages.length} pages).`
            : null
        }
      })
    );

    logger.info(
      {
        webSourceId: input.webSourceId,
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
    await withBusinessScope(input.businessId, (tx) =>
      tx.webSource.update({
        where: { id: input.webSourceId },
        data: { status: WebSourceStatus.FAILED, errorMessage: message }
      })
    );
    logger.error({ err: error, webSourceId: input.webSourceId, businessId: source.businessId }, "crawler.source.failed");
    throw error;
  }
}
