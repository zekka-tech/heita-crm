import type { NextApiRequest, NextApiResponse } from "next";

import { handleQrRequest } from "@/server/http/qr-handler";
import { writeFetchResponseToNextApi } from "@/server/http/next-api-adapter";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
  if (!token) {
    return res.status(400).json({ error: "Missing token." });
  }

  const response = await handleQrRequest(token);
  await writeFetchResponseToNextApi(res, response);
}
