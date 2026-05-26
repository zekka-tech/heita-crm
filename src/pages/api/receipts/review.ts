import type { NextApiRequest, NextApiResponse } from "next";

import { logger } from "@/lib/logger";
import { authenticateRequestUser } from "@/lib/request-auth";
import { requireRole } from "@/lib/staff";
import {
  approveOcrReceipt,
  listPendingOcrReceipts,
  rejectOcrReceipt
} from "@/server/services/ocr-receipt.service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await authenticateRequestUser(req.headers);
  if (!session?.userId) {
    return res.status(401).json({ error: "Unauthenticated." });
  }

  if (req.method === "GET") {
    const { businessId } = req.query;
    if (typeof businessId !== "string") {
      return res.status(400).json({ error: "businessId is required." });
    }

    try {
      await requireRole({ businessId, userId: session.userId, allowedRoles: ["OWNER", "MANAGER"] });
    } catch {
      return res.status(403).json({ error: "Forbidden." });
    }

    const receipts = await listPendingOcrReceipts(businessId);
    return res.status(200).json({ receipts });
  }

  if (req.method === "POST") {
    const { receiptId, action, businessId, overridePoints } = req.body as {
      receiptId?: string;
      action?: "approve" | "reject";
      businessId?: string;
      overridePoints?: number;
    };

    if (!receiptId || !action || !businessId || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "receiptId, action, and businessId are required." });
    }

    try {
      await requireRole({ businessId, userId: session.userId, allowedRoles: ["OWNER", "MANAGER"] });
    } catch {
      return res.status(403).json({ error: "Forbidden." });
    }

    try {
      if (action === "approve") {
        await approveOcrReceipt(receiptId, session.userId, overridePoints);
      } else {
        await rejectOcrReceipt(receiptId, session.userId);
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      logger.error({ err, receiptId, action }, "receipts.review.error");
      return res.status(400).json({ error: (err as Error).message });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed." });
}
