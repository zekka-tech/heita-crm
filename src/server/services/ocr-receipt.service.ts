import { appendTraceHeaders } from "@/lib/tracing";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { recalculateTier } from "@/server/services/loyalty.service";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

type OcrResult = {
  total: number | null;
  businessName: string | null;
  rawText: string;
  confidence: "high" | "medium" | "low";
};

const POINTS_PER_RAND = 1;

const OCR_PROMPT = `Extract the following from this receipt image and respond ONLY with JSON:
{
  "total": <number or null — grand total in ZAR, digits only, no currency symbol>,
  "businessName": <string or null — name of the store/restaurant>,
  "rawText": <string — all readable text from the receipt, newlines preserved>,
  "confidence": <"high" | "medium" | "low">
}

Rules:
- If no total is visible, set total to null.
- If the business name is unclear, set businessName to null.
- confidence is "high" if total and business name are clearly legible, "medium" if one is unclear, "low" if the image is blurry or illegible.
- Return ONLY valid JSON. No prose before or after.`;

function parseOcrJson(text: string): OcrResult {
  const parsed = JSON.parse(text) as OcrResult;
  return {
    total: typeof parsed.total === "number" ? parsed.total : null,
    businessName: parsed.businessName ?? null,
    rawText: parsed.rawText ?? "",
    confidence: parsed.confidence ?? "low"
  };
}

async function ocrWithDeepSeek(imageUrl: string): Promise<OcrResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not set");

  const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: appendTraceHeaders({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      model: "deepseek-vl2",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: OCR_PROMPT }
          ]
        }
      ]
    }),
    signal: AbortSignal.timeout(30_000)
  });

  if (!resp.ok) {
    const body = await resp.text();
    logger.warn({ status: resp.status, body }, "ocr.deepseek.error");
    throw new Error(`DeepSeek OCR error: ${resp.status}`);
  }

  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const text = data.choices[0]?.message.content ?? "{}";
  return parseOcrJson(text);
}

// Currency/total keywords that mark a grand-total line on a ZA receipt.
// Ordered loosely by specificity; matching is case-insensitive.
const TOTAL_KEYWORDS = [
  "amount due",
  "balance due",
  "grand total",
  "total due",
  "total",
  "balance",
  "amount payable",
  "to pay"
];

// Lines we never treat as a business name (common header noise).
const BUSINESS_NAME_BLOCKLIST = [
  "tax invoice",
  "invoice",
  "receipt",
  "vat reg",
  "vat no",
  "tel",
  "www.",
  "http"
];

/**
 * Parse a number out of a ZAR-formatted amount fragment.
 * Handles "R 1 234,56", "R1,234.56", "1234.56", "1.234,56".
 * Returns null if no plausible number is found.
 */
function parseZarAmount(fragment: string): number | null {
  // Keep only the part after the last currency-ish marker, then strip to digits/sep.
  const cleaned = fragment.replace(/[Rr]\s?/g, " ");
  // Grab the last number-looking token on the line (totals sit at the end).
  const matches = cleaned.match(/\d[\d\s.,]*\d|\d/g);
  const lastMatch = matches?.[matches.length - 1];
  if (!lastMatch) return null;

  const token = lastMatch.replace(/\s/g, "");

  // Determine decimal separator: if both '.' and ',' present, the last one is decimal.
  let normalised = token;
  const lastDot = token.lastIndexOf(".");
  const lastComma = token.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      // European style: '.' thousands, ',' decimal
      normalised = token.replace(/\./g, "").replace(",", ".");
    } else {
      // US style: ',' thousands, '.' decimal
      normalised = token.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    // Only commas. Treat as decimal if exactly 2 digits follow the last comma,
    // otherwise as a thousands separator.
    const after = token.length - lastComma - 1;
    normalised = after === 2 ? token.replace(",", ".") : token.replace(/,/g, "");
  } else {
    // Only dots (or none). Treat a lone dot with !=3 trailing digits as decimal;
    // multiple dots => thousands separators.
    const dotCount = (token.match(/\./g) ?? []).length;
    if (dotCount > 1) normalised = token.replace(/\./g, "");
  }

  const value = parseFloat(normalised);
  if (!Number.isFinite(value)) return null;
  return value;
}

/**
 * Heuristically extract the grand total and business name from raw receipt text.
 * Used for client-side (Tesseract.js) OCR output before falling back to a cloud
 * vision model.
 */
export function parseReceiptText(rawText: string): {
  total: number | null;
  businessName: string | null;
  confidence: "high" | "medium" | "low";
} {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // --- Total: scan keyword lines, collect candidates, pick the largest plausible. ---
  const candidates: number[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!TOTAL_KEYWORDS.some((kw) => lower.includes(kw))) continue;
    // Skip obvious non-grand-total lines (subtotal, vat total) where a better
    // grand total usually also exists; we still record them but they rarely win
    // because the grand total is the largest.
    const amount = parseZarAmount(line);
    if (amount !== null && amount > 0 && amount < 10_000_000) {
      candidates.push(amount);
    }
  }
  const total = candidates.length > 0 ? Math.max(...candidates) : null;

  // --- Business name: first meaningful non-blocklisted line near the top. ---
  let businessName: string | null = null;
  for (const line of lines.slice(0, 5)) {
    const lower = line.toLowerCase();
    if (BUSINESS_NAME_BLOCKLIST.some((b) => lower.includes(b))) continue;
    // Never treat a total/amount line as the business name.
    if (TOTAL_KEYWORDS.some((kw) => lower.includes(kw))) continue;
    // Skip lines that are mostly digits (addresses, phone numbers, dates).
    const letters = (line.match(/[A-Za-z]/g) ?? []).length;
    const digits = (line.match(/\d/g) ?? []).length;
    if (letters < 2 || digits > letters) continue;
    businessName = line;
    break;
  }

  const confidence: "high" | "medium" | "low" =
    total !== null && businessName !== null ? "high" : total !== null ? "medium" : "low";

  return { total, businessName, confidence };
}

/**
 * Extract structured receipt data. Primary path is client-side OCR text
 * (Tesseract.js, parsed server-side). When that text is missing or yields a
 * low-confidence / total-less result, fall back to the DeepSeek cloud vision
 * API. Never throws on OCR failure — returns a low-confidence empty result.
 */
export async function extractReceiptData(input: {
  imageUrl: string;
  clientRawText?: string | null;
}): Promise<OcrResult> {
  const { imageUrl, clientRawText } = input;
  const trimmedClientText = clientRawText?.trim() ?? "";

  if (trimmedClientText.length > 0) {
    const parsed = parseReceiptText(trimmedClientText);
    if (parsed.confidence !== "low" && parsed.total !== null) {
      logger.info({ source: "client-tesseract", imageUrl }, "ocr.receipt.success");
      return {
        total: parsed.total,
        businessName: parsed.businessName,
        rawText: trimmedClientText,
        confidence: parsed.confidence
      };
    }
    logger.info(
      { imageUrl, parsedConfidence: parsed.confidence, hasTotal: parsed.total !== null },
      "ocr.client.insufficient.fallback"
    );
  }

  // Fall back to the cloud vision model.
  try {
    const result = await ocrWithDeepSeek(imageUrl);
    logger.info({ source: "deepseek", imageUrl }, "ocr.receipt.success");
    return result;
  } catch (err) {
    logger.warn({ imageUrl, err }, "ocr.deepseek.failed");
  }

  logger.error({ imageUrl }, "ocr.all.providers.failed");
  return {
    total: null,
    businessName: null,
    rawText: trimmedClientText,
    confidence: "low"
  };
}

export async function submitOcrReceipt(input: {
  businessId: string;
  userId: string;
  imageUrl: string;
  clientRawText?: string | null;
}) {
  const { businessId, userId, imageUrl, clientRawText } = input;

  const ocrResult = await extractReceiptData({ imageUrl, clientRawText });

  const pointsToAward =
    ocrResult.total !== null && ocrResult.confidence !== "low"
      ? Math.round(ocrResult.total * POINTS_PER_RAND)
      : null;

  const receipt = await prisma.ocrReceipt.create({
    data: {
      businessId,
      userId,
      imageUrl,
      rawOcrText: ocrResult.rawText,
      parsedTotal: ocrResult.total,
      parsedBusiness: ocrResult.businessName,
      pointsToAward,
      status: "PENDING_REVIEW"
    }
  });

  logger.info(
    { receiptId: receipt.id, businessId, userId, total: ocrResult.total, pointsToAward },
    "ocr.receipt.submitted"
  );

  return { receiptId: receipt.id, ocrResult, pointsToAward };
}

const MAX_OVERRIDE_POINTS = 50_000;

export async function approveOcrReceipt(
  receiptId: string,
  staffUserId: string,
  businessId: string,
  overridePoints?: number
) {
  // Clamp override to a safe maximum to prevent runaway point grants.
  const clampedOverride =
    overridePoints !== undefined
      ? Math.min(Math.max(0, Math.round(overridePoints)), MAX_OVERRIDE_POINTS)
      : undefined;

  // Pre-flight check to avoid acquiring a tx for obviously invalid calls.
  const preCheck = await prisma.ocrReceipt.findUnique({
    where: { id: receiptId },
    select: { id: true, status: true, businessId: true }
  });

  if (!preCheck) throw new Error("Receipt not found.");
  // Tenant isolation: the receipt must belong to the asserted business.
  if (preCheck.businessId !== businessId) throw new Error("Receipt not found.");
  if (preCheck.status !== "PENDING_REVIEW") {
    throw new Error(`Cannot approve receipt in status: ${preCheck.status}`);
  }

  await prisma.$transaction(async (tx) => {
    // Re-fetch inside the transaction for authoritative, serialised status check.
    const receipt = await tx.ocrReceipt.findUnique({
      where: { id: receiptId },
      select: {
        id: true, businessId: true, userId: true, pointsToAward: true, status: true
      }
    });

    if (!receipt) throw new Error("Receipt not found.");
    // Re-assert tenant isolation inside the transaction.
    if (receipt.businessId !== businessId) throw new Error("Receipt not found.");
    if (receipt.status !== "PENDING_REVIEW") {
      // Already approved or rejected by a concurrent request — nothing to do.
      return;
    }

    const points = clampedOverride ?? receipt.pointsToAward ?? 0;

    const membership = await tx.membership.findFirst({
      where: { businessId: receipt.businessId, userId: receipt.userId }
    });

    let transaction = null;
    if (points > 0 && membership) {
      // Guard against a loyalty transaction already existing for this receipt
      // (e.g., if a previous attempt committed the loyaltyTransaction but
      // crashed before updating the OcrReceipt status).
      const existing = await tx.loyaltyTransaction.findFirst({
        where: {
          membershipId: membership.id,
          description: { contains: receiptId }
        },
        select: { id: true }
      });

      if (existing) {
        // Transaction already created for this receipt — just update the
        // receipt status to reflect it was approved.
        await tx.ocrReceipt.update({
          where: { id: receiptId },
          data: {
            status: "APPROVED",
            reviewedAt: new Date(),
            reviewedBy: staffUserId,
            pointsToAward: points,
            transactionId: existing.id
          }
        });
        return;
      }

      transaction = await tx.loyaltyTransaction.create({
        data: {
          businessId: receipt.businessId,
          userId: receipt.userId,
          membershipId: membership.id,
          type: "EARN",
          pointsDelta: points,
          description: `Receipt OCR auto-earn (receipt ${receiptId})`
        }
      });

      await tx.membership.update({
        where: { id: membership.id },
        data: { pointsBalance: { increment: points } }
      });

      await recalculateTier(tx, { membershipId: membership.id, actorUserId: staffUserId });
    }

    await tx.ocrReceipt.update({
      where: { id: receiptId },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedBy: staffUserId,
        pointsToAward: points,
        transactionId: transaction?.id ?? null
      }
    });
  }, { maxWait: 5_000, timeout: 20_000 });

  logger.info({ receiptId, staffUserId }, "ocr.receipt.approved");

  const approved = await prisma.ocrReceipt.findUnique({
    where: { id: receiptId },
    select: { businessId: true }
  });
  if (approved) {
    await recordStaffAuditLog({
      businessId: approved.businessId,
      actorUserId: staffUserId,
      action: "OCR_RECEIPT_APPROVED",
      targetType: "OcrReceipt",
      targetId: receiptId
    });
  }
}

export async function rejectOcrReceipt(receiptId: string, staffUserId: string, businessId: string) {
  const receipt = await prisma.ocrReceipt.findUnique({
    where: { id: receiptId },
    select: { id: true, businessId: true, status: true }
  });
  if (!receipt) throw new Error("Receipt not found.");
  if (receipt.businessId !== businessId) throw new Error("Receipt not found.");
  if (receipt.status !== "PENDING_REVIEW") {
    throw new Error(`Cannot reject receipt in status: ${receipt.status}`);
  }

  await prisma.ocrReceipt.update({
    where: { id: receiptId },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewedBy: staffUserId }
  });
  logger.info({ receiptId, staffUserId }, "ocr.receipt.rejected");

  const rejected = await prisma.ocrReceipt.findUnique({
    where: { id: receiptId },
    select: { businessId: true }
  });
  if (rejected) {
    await recordStaffAuditLog({
      businessId: rejected.businessId,
      actorUserId: staffUserId,
      action: "OCR_RECEIPT_REJECTED",
      targetType: "OcrReceipt",
      targetId: receiptId
    });
  }
}

export async function listPendingOcrReceipts(businessId: string) {
  return prisma.ocrReceipt.findMany({
    where: { businessId, status: "PENDING_REVIEW" },
    orderBy: { createdAt: "asc" },
    take: 50
  });
}
