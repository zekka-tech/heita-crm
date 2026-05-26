import { appendTraceHeaders } from "@/lib/tracing";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

type OcrResult = {
  total: number | null;
  businessName: string | null;
  rawText: string;
  confidence: "high" | "medium" | "low";
};

const POINTS_PER_RAND = 1;

export async function extractReceiptData(imageUrl: string): Promise<OcrResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured for receipt OCR.");
  }

  const model = "claude-haiku-4-5-20251001";

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: appendTraceHeaders({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      model,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", url: imageUrl }
            },
            {
              type: "text",
              text: `Extract the following from this receipt image and respond ONLY with JSON:
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
- Return ONLY valid JSON. No prose before or after.`
            }
          ]
        }
      ]
    }),
    signal: AbortSignal.timeout(30_000)
  });

  if (!resp.ok) {
    const body = await resp.text();
    logger.error({ status: resp.status, body }, "ocr.anthropic.error");
    throw new Error(`Receipt OCR API error: ${resp.status}`);
  }

  const data = (await resp.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content.find((c) => c.type === "text")?.text ?? "{}";

  try {
    const parsed = JSON.parse(text) as OcrResult;
    return {
      total: typeof parsed.total === "number" ? parsed.total : null,
      businessName: parsed.businessName ?? null,
      rawText: parsed.rawText ?? "",
      confidence: parsed.confidence ?? "low"
    };
  } catch {
    logger.warn({ text }, "ocr.parse.failed");
    return { total: null, businessName: null, rawText: text, confidence: "low" };
  }
}

export async function submitOcrReceipt(input: {
  businessId: string;
  userId: string;
  imageUrl: string;
}) {
  const { businessId, userId, imageUrl } = input;

  const ocrResult = await extractReceiptData(imageUrl);

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

export async function approveOcrReceipt(
  receiptId: string,
  staffUserId: string,
  overridePoints?: number
) {
  const receipt = await prisma.ocrReceipt.findUnique({
    where: { id: receiptId },
    select: {
      id: true, businessId: true, userId: true, pointsToAward: true, status: true
    }
  });

  if (!receipt) throw new Error("Receipt not found.");
  if (receipt.status !== "PENDING_REVIEW") {
    throw new Error(`Cannot approve receipt in status: ${receipt.status}`);
  }

  const points = overridePoints ?? receipt.pointsToAward ?? 0;

  await prisma.$transaction(async (tx) => {
    const membership = await tx.membership.findFirst({
      where: { businessId: receipt.businessId, userId: receipt.userId }
    });

    let transaction = null;
    if (points > 0 && membership) {
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
  });

  logger.info({ receiptId, staffUserId, points }, "ocr.receipt.approved");
}

export async function rejectOcrReceipt(receiptId: string, staffUserId: string) {
  await prisma.ocrReceipt.update({
    where: { id: receiptId },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewedBy: staffUserId }
  });
  logger.info({ receiptId, staffUserId }, "ocr.receipt.rejected");
}

export async function listPendingOcrReceipts(businessId: string) {
  return prisma.ocrReceipt.findMany({
    where: { businessId, status: "PENDING_REVIEW" },
    orderBy: { createdAt: "asc" },
    take: 50
  });
}
