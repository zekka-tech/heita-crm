import { logger } from "@/lib/logger";
import { startDocumentIngestionWorker } from "@/workers/ingest-document.worker";

export async function startWorkers() {
  const documentWorker = startDocumentIngestionWorker();

  return {
    status: documentWorker ? "running" : "idle"
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
