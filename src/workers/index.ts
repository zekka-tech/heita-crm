import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { registerShutdownHandler } from "@/lib/shutdown";
import { startCustomerImportWorker } from "@/workers/customer-import.worker";
import { startDocumentIngestionWorker } from "@/workers/ingest-document.worker";
import { startWebCrawlWorker } from "@/workers/crawl-web-source.worker";

export async function startWorkers() {
  const documentWorker = startDocumentIngestionWorker();
  const customerImportWorker = startCustomerImportWorker();
  const webCrawlWorker = startWebCrawlWorker();

  // Phase: workers — drain in-flight jobs before disconnecting DB/Redis
  registerShutdownHandler(async () => {
    if (documentWorker) {
      await documentWorker.close().catch(() => undefined);
    }
    if (customerImportWorker) {
      await customerImportWorker.close().catch(() => undefined);
    }
    if (webCrawlWorker) {
      await webCrawlWorker.close().catch(() => undefined);
    }
  }, "workers");

  // Phase: infra — DB and Redis connections close after workers have drained
  registerShutdownHandler(async () => {
    await prisma.$disconnect().catch(() => undefined);
  }, "infra");

  registerShutdownHandler(async () => {
    const redis = getRedis();
    if (redis) {
      await redis.quit().catch(() => undefined);
    }
  }, "infra");

  registerShutdownHandler(async () => {
    if (global.__heitaRedisQueue__) {
      await global.__heitaRedisQueue__.quit().catch(() => undefined);
      delete global.__heitaRedisQueue__;
    }
  }, "infra");

  return {
    status: documentWorker || customerImportWorker || webCrawlWorker ? "running" : "idle"
  };
}

if (import.meta.main) {
  startWorkers()
    .then((result) => {
      logger.info({ status: result.status }, "workers.started");
    })
    .catch((error) => {
      logger.error({ err: error }, "workers.failed_to_start");
      process.exitCode = 1;
    });
}
