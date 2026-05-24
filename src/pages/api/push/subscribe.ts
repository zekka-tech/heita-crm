import type { NextApiRequest, NextApiResponse } from "next";

import {
  handlePushSubscribe,
  handlePushUnsubscribe
} from "@/server/http/push-subscribe-handler";
import {
  nextApiRequestToRequest,
  writeFetchResponseToNextApi
} from "@/server/http/next-api-adapter";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const method = req.method ?? "POST";
  if (method !== "POST" && method !== "DELETE") {
    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const request = await nextApiRequestToRequest(req);
  const response =
    method === "DELETE"
      ? await handlePushUnsubscribe(request)
      : await handlePushSubscribe(request);

  await writeFetchResponseToNextApi(res, response);
}
