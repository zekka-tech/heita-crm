import type { NextApiRequest, NextApiResponse } from "next";

import { handlers } from "@/lib/auth";
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
    method === "POST" ? await handlers.POST(request) : await handlers.GET(request);

  await writeFetchResponseToNextApi(res, response);
}
