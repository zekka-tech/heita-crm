import type { NextApiRequest, NextApiResponse } from "next";

import { handleCleanupOtpCron } from "@/server/http/cron-handlers";
import {
  nextApiRequestToRequest,
  writeFetchResponseToNextApi
} from "@/server/http/next-api-adapter";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const request = await nextApiRequestToRequest(req);
  const response = await handleCleanupOtpCron(request);
  await writeFetchResponseToNextApi(res, response);
}
