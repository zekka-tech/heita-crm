import type { NextApiRequest, NextApiResponse } from "next";
import { TransactionType } from "@prisma/client";

import { authenticateRequestUser } from "@/lib/request-auth";
import {
  formatReceiptHistoryCsv,
  getReceiptHistory
} from "@/server/services/receipt-history.service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const session = await authenticateRequestUser(req.headers);
  if (!session) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const businessSlug = Array.isArray(req.query.businessSlug)
    ? req.query.businessSlug[0]
    : req.query.businessSlug;
  const type = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type;
  const from = Array.isArray(req.query.from) ? req.query.from[0] : req.query.from;
  const to = Array.isArray(req.query.to) ? req.query.to[0] : req.query.to;

  if (!businessSlug) {
    return res.status(400).json({ error: "businessSlug is required." });
  }

  const history = await getReceiptHistory({
    businessSlug,
    userId: session.userId,
    type:
      type && Object.values(TransactionType).includes(type as TransactionType)
        ? (type as TransactionType)
        : "ALL",
    dateFrom: from ? new Date(from) : null,
    dateTo: to ? new Date(to) : null
  });

  if (!history) {
    return res.status(404).json({ error: "History not found." });
  }

  const csv = formatReceiptHistoryCsv({
    businessName: history.membership.business.name,
    transactions: history.transactions
  });

  const safeSlug = businessSlug.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeSlug}-receipt-history.csv"`
  );
  return res.status(200).send(csv);
}
