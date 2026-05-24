import type { NextApiRequest, NextApiResponse } from "next";

import { CSRF_COOKIE, CSRF_HEADER, verifyCsrfTokenPair } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { authenticateRequestUser } from "@/lib/request-auth";
import { revokeAllSessions } from "@/server/services/session.service";

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
    return res.status(403).json({
      error: "CSRF validation failed.",
      reason: csrfResult.reason
    });
  }

  const session = await authenticateRequestUser(req.headers);
  if (!session) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const limit = await enforceRateLimit({
    identifier: `sign-out-all:${session.userId}`,
    windowSeconds: 60,
    max: 3
  });
  for (const [name, value] of Object.entries(rateLimitHeaders(limit))) {
    res.setHeader(name, value);
  }

  if (!limit.allowed) {
    return res.status(429).json({ error: "Try again in a moment." });
  }

  const newVersion = await revokeAllSessions(session.userId);
  logger.info({ userId: session.userId, newVersion }, "auth.session.revoked_all");

  return res.status(200).json({ ok: true, sessionVersion: newVersion });
}
