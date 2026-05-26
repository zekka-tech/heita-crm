import type { NextApiRequest, NextApiResponse } from "next";

import { authenticateRequestUser } from "@/lib/request-auth";
import { requireRole } from "@/lib/staff";
import { listInvoices } from "@/server/services/billing.service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const session = await authenticateRequestUser(req.headers);
  if (!session?.userId) {
    return res.status(401).json({ error: "Unauthenticated." });
  }

  const { businessId } = req.query;
  if (typeof businessId !== "string") {
    return res.status(400).json({ error: "businessId is required." });
  }

  try {
    await requireRole({ businessId, userId: session.userId, allowedRoles: ["OWNER", "MANAGER"] });
  } catch {
    return res.status(403).json({ error: "Forbidden." });
  }

  const invoices = await listInvoices(businessId);
  return res.status(200).json({ invoices });
}
