import { logger } from "@/lib/logger";

type ShutdownHandler = () => Promise<void> | void;

const handlers: ShutdownHandler[] = [];
let registered = false;
let shuttingDown = false;

const SHUTDOWN_TIMEOUT_MS = 10_000;

export function registerShutdownHandler(handler: ShutdownHandler): () => void {
  handlers.push(handler);
  ensureSignalListeners();

  return () => {
    const index = handlers.indexOf(handler);
    if (index >= 0) {
      handlers.splice(index, 1);
    }
  };
}

function ensureSignalListeners() {
  if (registered) return;
  registered = true;

  if (typeof process === "undefined" || typeof process.on !== "function") {
    return;
  }

  const onSignal = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    void runShutdown(signal).then(() => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
}

async function runShutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal, handlers: handlers.length }, "shutdown.start");

  const tasks = handlers.map(async (handler) => {
    try {
      await Promise.race([
        Promise.resolve().then(() => handler()),
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error(`shutdown handler exceeded ${SHUTDOWN_TIMEOUT_MS}ms`)),
            SHUTDOWN_TIMEOUT_MS
          )
        )
      ]);
    } catch (error) {
      logger.error({ err: error }, "shutdown.handler_failed");
    }
  });

  await Promise.all(tasks);
  logger.info("shutdown.complete");
}

export const __shutdownInternals = {
  reset() {
    handlers.length = 0;
    registered = false;
    shuttingDown = false;
  }
};
