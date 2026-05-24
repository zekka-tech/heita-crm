import type { NextApiRequest, NextApiResponse } from "next";

import { CSRF_COOKIE, CSRF_HEADER, verifyCsrfTokenPair } from "@/lib/csrf";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { authenticateRequestUser } from "@/lib/request-auth";
import { exportAccountData } from "@/server/services/account.service";

const EXPORT_WINDOW_SECONDS = 30 * 24 * 60 * 60;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const csrfResult = verifyCsrfTokenPair(
    req.cookies[CSRF_COOKIE] ?? null,
    typeof req.headers[CSRF_HEADER] === "string" ? req.headers[CSRF_HEADER] : null
  );
  if (!csrfResult.ok) {
    return res
      .status(403)
      .json({ error: "CSRF validation failed.", reason: csrfResult.reason });
  }

  const session = await authenticateRequestUser(req.headers);
  if (!session) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const limit = await enforceRateLimit({
    identifier: `account-export:${session.userId}`,
    windowSeconds: EXPORT_WINDOW_SECONDS,
    max: 1
  });
  const limitHeaders = rateLimitHeaders(limit);
  for (const [name, value] of Object.entries(limitHeaders)) {
    res.setHeader(name, value);
  }

  if (!limit.allowed) {
    return res
      .status(429)
      .json({ error: "Account exports are limited to one request every 30 days." });
  }

  const payload = await exportAccountData(session.userId);

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="heita-account-export.json"'
  );
  return res.status(200).send(JSON.stringify(payload, null, 2));
}
