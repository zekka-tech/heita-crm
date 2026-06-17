import type { NextApiRequest, NextApiResponse } from "next";

import { verifyCsrfNextApiRequest } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { authenticateRequestUser } from "@/lib/request-auth";
import { assertOwnedStorageUrl } from "@/lib/security";
import { withBusinessScope } from "@/lib/prisma";
import { submitOcrReceipt } from "@/server/services/ocr-receipt.service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!verifyCsrfNextApiRequest(req)) {
    return res.status(403).json({ error: "CSRF validation failed." });
  }

  const session = await authenticateRequestUser(req.headers);
  if (!session?.userId) {
    return res.status(401).json({ error: "Unauthenticated." });
  }

  const { businessId, imageUrl, rawText } = req.body as {
    businessId?: string;
    imageUrl?: string;
    rawText?: unknown;
  };

  if (!businessId || !imageUrl) {
    return res.status(400).json({ error: "businessId and imageUrl are required." });
  }

  // Optional client-side (Tesseract.js) OCR text. Validate type + cap length to
  // bound payload size; trim before passing through to the OCR service.
  const MAX_RAW_TEXT = 50_000;
  let clientRawText: string | null = null;
  if (rawText !== undefined && rawText !== null) {
    if (typeof rawText !== "string") {
      return res.status(400).json({ error: "rawText must be a string." });
    }
    if (rawText.length > MAX_RAW_TEXT) {
      return res.status(400).json({ error: "rawText is too large." });
    }
    clientRawText = rawText.trim();
  }

  // Guard against SSRF: only accept URLs pointing to Heita's own storage.
  try {
    assertOwnedStorageUrl(imageUrl);
  } catch {
    return res.status(400).json({ error: "imageUrl must reference Heita's own storage." });
  }

  // Verify the caller is an active member of this business before submitting
  // a receipt on its behalf. Without this check any authenticated user could
  // spam the review queue of any business.
  const membership = await withBusinessScope(businessId, (tx) =>
    tx.membership.findFirst({
      where: { businessId, userId: session.userId, isActive: true },
      select: { id: true }
    })
  );
  if (!membership) {
    return res.status(403).json({ error: "You are not a member of this business." });
  }

  try {
    const result = await submitOcrReceipt({
      businessId,
      userId: session.userId,
      imageUrl,
      clientRawText
    });
    return res.status(201).json(result);
  } catch (err) {
    logger.error({ err, businessId, userId: session.userId }, "receipts.submit.error");
    return res.status(502).json({ error: "Unable to process receipt at this time." });
  }
}
