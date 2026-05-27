import type { NextApiRequest, NextApiResponse } from "next";

import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { handleQrRequest } from "@/server/http/qr-handler";
import { writeFetchResponseToNextApi } from "@/server/http/next-api-adapter";

function getIp(req: NextApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]?.trim();
  return forwardedIp ?? (req.socket?.remoteAddress ?? "0.0.0.0");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const ip = getIp(req);
  const rl = await enforceRateLimit({ identifier: `qr:${ip}`, windowSeconds: 60, max: 30 });
  const rlHeaders = rateLimitHeaders(rl);
  for (const [k, v] of Object.entries(rlHeaders)) res.setHeader(k, v as string);

  if (!rl.allowed) {
    return res.status(429).json({ error: "Too many requests." });
  }

  const token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
  if (!token) {
    return res.status(400).json({ error: "Missing token." });
  }

  const response = await handleQrRequest(token);
  await writeFetchResponseToNextApi(res, response);
}
