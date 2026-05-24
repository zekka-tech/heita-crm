import type { NextApiRequest, NextApiResponse } from "next";

import { handleHealthRequest } from "@/server/http/health-handler";
import {
  nextApiRequestToRequest,
  writeFetchResponseToNextApi
} from "@/server/http/next-api-adapter";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const request = await nextApiRequestToRequest(req);
  const response = await handleHealthRequest(request);
  await writeFetchResponseToNextApi(res, response);
}
