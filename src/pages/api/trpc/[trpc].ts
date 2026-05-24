import type { NextApiRequest, NextApiResponse } from "next";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { logger } from "@/lib/logger";
import { appRouter } from "@/server/routers";
import {
  nextApiRequestToRequest,
  writeFetchResponseToNextApi
} from "@/server/http/next-api-adapter";
import { createTRPCContext } from "@/server/trpc";

const endpoint = "/api/trpc";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const request = await nextApiRequestToRequest(req);
  const response = await fetchRequestHandler({
    endpoint,
    req: request,
    router: appRouter,
    maxBatchSize: 10,
    createContext: ({ req: trpcReq }) => createTRPCContext({ req: trpcReq }),
    onError({ error, path, req: trpcReq }) {
      logger.error(
        {
          err: error,
          path,
          method: trpcReq.method
        },
        "trpc.request_failed"
      );
    }
  });

  await writeFetchResponseToNextApi(res, response);
}
