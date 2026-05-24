import type { NextApiRequest, NextApiResponse } from "next";

import {
  handleWhatsappVerification,
  handleWhatsappWebhook
} from "@/server/http/webhook-handlers";
import {
  nextApiRequestToRequest,
  writeFetchResponseToNextApi
} from "@/server/http/next-api-adapter";

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
  const response =
    method === "POST"
      ? await handleWhatsappWebhook(request)
      : await handleWhatsappVerification(request);

  await writeFetchResponseToNextApi(res, response);
}
