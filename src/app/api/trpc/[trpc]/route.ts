import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { logger } from "@/lib/logger";
import { appRouter } from "@/server/routers";
import { createTRPCContext } from "@/server/trpc";

const endpoint = "/api/trpc";

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint,
    req,
    router: appRouter,
    maxBatchSize: 10,
    createContext: ({ req }) => createTRPCContext({ req }),
    onError({ error, path, req }) {
      logger.error(
        {
          err: error,
          path,
          method: req.method
        },
        "trpc.request_failed"
      );
    }
  });
}

export { handler as GET, handler as POST };
