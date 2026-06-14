/**
 * POST /api/receipts/batch
 *
 * Batch receipt/till-slip import for GROWTH and SCALE tenants (§1.3 — W6).
 * Accepts up to 50 receipt items and enqueues each via BullMQ for async
 * OCR processing through the existing review queue pipeline.
 *
 * Requires: authenticated staff (OWNER/MANAGER/STAFF) of the business.
 * Tier gate: GROWTH or SCALE only.
 * Rate limit: 5 batch requests per business per hour.
 */
import type { NextApiRequest, NextApiResponse } from "next";

import { verifyCsrfNextApiRequest } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getReceiptBatchQueue } from "@/lib/receipt-batch-queue";
import { authenticateRequestUser } from "@/lib/request-auth";
import { assertOwnedStorageUrl } from "@/lib/security";
import { requireRole } from "@/lib/staff";
import { getEffectivePlan } from "@/server/services/billing.service";

const MAX_RECEIPTS_PER_BATCH = 50;
const MAX_RAW_TEXT = 50_000;

type ReceiptItem = {
  imageUrl: string;
  rawText?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const { businessId, receipts } = req.body as {
    businessId?: string;
    receipts?: ReceiptItem[];
  };

  if (!businessId || typeof businessId !== "string") {
    return res.status(400).json({ error: "businessId is required." });
  }

  // Verify staff role for this business.
  try {
    await requireRole({
      businessId,
      userId: session.userId,
      allowedRoles: ["OWNER", "MANAGER", "STAFF"]
    });
  } catch {
    return res.status(403).json({ error: "Forbidden." });
  }

  // Tier gate: GROWTH or SCALE only (batch import is a premium feature per §1.3).
  const plan = await getEffectivePlan(businessId);
  if (plan !== "GROWTH" && plan !== "SCALE") {
    return res.status(402).json({
      error: "Batch receipt import is available on Growth and Scale plans. Upgrade to use this feature.",
      requiredPlan: "GROWTH"
    });
  }

  // Rate limit: 5 batches per business per hour.
  const rl = await enforceRateLimit({
    identifier: `receipts:batch:${businessId}`,
    windowSeconds: 3600,
    max: 5
  });
  if (!rl.allowed) {
    return res.status(429).json({ error: "Too many batch requests. Limit: 5 per hour." });
  }

  // Validate receipts array.
  if (!Array.isArray(receipts) || receipts.length === 0) {
    return res.status(400).json({ error: "receipts array is required and must not be empty." });
  }

  if (receipts.length > MAX_RECEIPTS_PER_BATCH) {
    return res.status(400).json({
      error: `Cannot import more than ${MAX_RECEIPTS_PER_BATCH} receipts per batch.`
    });
  }

  const batchId = `batch_${Date.now()}_${session.userId.slice(-6)}`;
  const validatedReceipts: ReceiptItem[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < receipts.length; i++) {
    const item = receipts[i];
    if (!item || typeof item.imageUrl !== "string") {
      errors.push({ index: i, error: "imageUrl is required." });
      continue;
    }

    try {
      assertOwnedStorageUrl(item.imageUrl);
    } catch {
      errors.push({ index: i, error: "imageUrl must reference Heita's own storage." });
      continue;
    }

    if (item.rawText !== undefined && typeof item.rawText !== "string") {
      errors.push({ index: i, error: "rawText must be a string if provided." });
      continue;
    }

    if (typeof item.rawText === "string" && item.rawText.length > MAX_RAW_TEXT) {
      errors.push({ index: i, error: "rawText is too large (max 50,000 chars)." });
      continue;
    }

    validatedReceipts.push(item);
  }

  if (validatedReceipts.length === 0) {
    return res.status(400).json({ error: "No valid receipts to process.", errors });
  }

  // Enqueue each receipt for async OCR processing.
  const queue = getReceiptBatchQueue();
  if (!queue) {
    // Graceful degradation: if Redis is unavailable, process receipts synchronously.
    logger.warn({ businessId, batchId }, "receipts.batch.queue_unavailable.sync_fallback");
    const { submitOcrReceipt } = await import("@/server/services/ocr-receipt.service");
    const results: Array<{ receiptId: string; index: number }> = [];
    for (let i = 0; i < validatedReceipts.length; i++) {
      const item = validatedReceipts[i]!;
      const result = await submitOcrReceipt({
        businessId,
        userId: session.userId,
        imageUrl: item.imageUrl,
        clientRawText: item.rawText ?? null
      });
      results.push({ receiptId: result.receiptId, index: i });
    }
    logger.info({ businessId, batchId, count: results.length }, "receipts.batch.sync.done");
    return res.status(201).json({
      batchId,
      queued: results.length,
      skipped: errors.length,
      results,
      errors
    });
  }

  const jobIds: string[] = [];
  for (let i = 0; i < validatedReceipts.length; i++) {
    const item = validatedReceipts[i]!;
    const job = await queue.add(
      "receipt",
      {
        businessId,
        userId: session.userId,
        imageUrl: item.imageUrl,
        rawText: item.rawText ?? null,
        batchId
      },
      { jobId: `${batchId}_${i}` }
    );
    jobIds.push(job.id ?? `${batchId}_${i}`);
  }

  logger.info(
    { businessId, userId: session.userId, batchId, queued: jobIds.length, skipped: errors.length },
    "receipts.batch.queued"
  );

  return res.status(201).json({
    batchId,
    queued: jobIds.length,
    skipped: errors.length,
    jobIds,
    errors
  });
}
