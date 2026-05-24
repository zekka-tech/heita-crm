import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { CSRF_COOKIE, CSRF_HEADER, verifyCsrfTokenPair } from "@/lib/csrf";
import { authenticateRequestUser } from "@/lib/request-auth";
import { softDeleteAccount, updateAccountProfile } from "@/server/services/account.service";

const UpdateAccountSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  preferredAiMode: z.string().trim().min(1).max(50).nullable().optional()
});

function verifyCsrf(req: NextApiRequest, res: NextApiResponse) {
  const result = verifyCsrfTokenPair(
    req.cookies[CSRF_COOKIE] ?? null,
    typeof req.headers[CSRF_HEADER] === "string" ? req.headers[CSRF_HEADER] : null
  );

  if (result.ok) {
    return true;
  }

  res.status(403).json({
    error: "CSRF validation failed.",
    reason: result.reason
  });
  return false;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "PATCH" && req.method !== "DELETE") {
    res.setHeader("Allow", "PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!verifyCsrf(req, res)) {
    return;
  }

  const session = await authenticateRequestUser(req.headers);
  if (!session) {
    return res.status(401).json({ error: "Authentication required." });
  }

  if (req.method === "PATCH") {
    const parsed = UpdateAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid account update." });
    }

    const user = await updateAccountProfile({
      userId: session.userId,
      name: parsed.data.name ?? undefined,
      email: parsed.data.email ?? undefined,
      preferredAiMode: parsed.data.preferredAiMode ?? undefined
    });

    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        preferredAiMode: user.preferredAiMode
      }
    });
  }

  await softDeleteAccount(session.userId);
  return res.status(200).json({ ok: true });
}
