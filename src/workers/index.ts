import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { registerShutdownHandler } from "@/lib/shutdown";
import { startCustomerImportWorker } from "@/workers/customer-import.worker";
import { startDocumentIngestionWorker } from "@/workers/ingest-document.worker";

export async function startWorkers() {
  const documentWorker = startDocumentIngestionWorker();
  const customerImportWorker = startCustomerImportWorker();

  registerShutdownHandler(async () => {
    if (documentWorker) {
      await documentWorker.close().catch(() => undefined);
    }

    if (customerImportWorker) {
      await customerImportWorker.close().catch(() => undefined);
    }
  });

  registerShutdownHandler(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

  registerShutdownHandler(async () => {
    const redis = getRedis();
    if (redis) {
      await redis.quit().catch(() => undefined);
    }
  });

  registerShutdownHandler(async () => {
    if (global.__heitaRedisQueue__) {
      await global.__heitaRedisQueue__.quit().catch(() => undefined);
      delete global.__heitaRedisQueue__;
    }
  });

  return {
    status: documentWorker || customerImportWorker ? "running" : "idle"
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
