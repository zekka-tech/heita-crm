import type { NextApiRequest, NextApiResponse } from "next";

import { logger } from "@/lib/logger";
import { authenticateRequestUser } from "@/lib/request-auth";
import { submitOcrReceipt } from "@/server/services/ocr-receipt.service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const session = await authenticateRequestUser(req.headers);
  if (!session?.userId) {
    return res.status(401).json({ error: "Unauthenticated." });
  }

  const { businessId, imageUrl } = req.body as {
    businessId?: string;
    imageUrl?: string;
  };

  if (!businessId || !imageUrl) {
    return res.status(400).json({ error: "businessId and imageUrl are required." });
  }

  if (!imageUrl.startsWith("https://")) {
    return res.status(400).json({ error: "imageUrl must be a secure HTTPS URL." });
  }

  try {
    const result = await submitOcrReceipt({
      businessId,
      userId: session.userId,
      imageUrl
    });
    return res.status(201).json(result);
  } catch (err) {
    logger.error({ err, businessId, userId: session.userId }, "receipts.submit.error");
    return res.status(502).json({ error: "Unable to process receipt at this time." });
  }
}
