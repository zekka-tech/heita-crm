import { TextractClient, AnalyzeExpenseCommand } from "@aws-sdk/client-textract";

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

async function ocrWithMinimax(imageUrl: string): Promise<OcrResult> {
  const apiKey = process.env.MINIMAX_API_KEY;
  const groupId = process.env.MINIMAX_GROUP_ID;
  if (!apiKey) throw new Error("MINIMAX_API_KEY not set");

  const url = groupId
    ? `https://api.minimax.chat/v1/text/chatcompletion_v2?GroupId=${groupId}`
    : "https://api.minimax.chat/v1/text/chatcompletion_v2";

  const resp = await fetch(url, {
    method: "POST",
    headers: appendTraceHeaders({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      model: "MiniMax-VL-01",
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
    logger.warn({ status: resp.status, body }, "ocr.minimax.error");
    throw new Error(`Minimax OCR error: ${resp.status}`);
  }

  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const text = data.choices[0]?.message.content ?? "{}";
  return parseOcrJson(text);
}

async function ocrWithTextract(imageUrl: string): Promise<OcrResult> {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials not set for Textract fallback");
  }

  // Download the image bytes
  const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
  if (!imgResp.ok) throw new Error(`Failed to fetch image for Textract: ${imgResp.status}`);
  const imgBuffer = Buffer.from(await imgResp.arrayBuffer());

  const client = new TextractClient({
    region,
    credentials: { accessKeyId, secretAccessKey }
  });

  const command = new AnalyzeExpenseCommand({
    Document: { Bytes: imgBuffer }
  });

  const result = await client.send(command);

  let total: number | null = null;
  let businessName: string | null = null;
  const rawLines: string[] = [];

  for (const doc of result.ExpenseDocuments ?? []) {
    for (const field of doc.SummaryFields ?? []) {
      const type = field.Type?.Text?.toUpperCase();
      const value = field.LabelDetection?.Text ?? field.ValueDetection?.Text ?? "";
      rawLines.push(value);
      if (type === "TOTAL") {
        const num = parseFloat(value.replace(/[^0-9.]/g, ""));
        if (!isNaN(num)) total = num;
      }
      if (type === "VENDOR_NAME" || type === "NAME") {
        businessName = value || null;
      }
    }
    for (const lineItem of doc.LineItemGroups ?? []) {
      for (const row of lineItem.LineItems ?? []) {
        for (const field of row.LineItemExpenseFields ?? []) {
          rawLines.push(field.ValueDetection?.Text ?? "");
        }
      }
    }
  }

  const confidence: OcrResult["confidence"] =
    total !== null && businessName !== null ? "high" : total !== null ? "medium" : "low";

  return { total, businessName, rawText: rawLines.filter(Boolean).join("\n"), confidence };
}

export async function extractReceiptData(imageUrl: string): Promise<OcrResult> {
  const providers: Array<{ name: string; fn: () => Promise<OcrResult> }> = [
    { name: "deepseek", fn: () => ocrWithDeepSeek(imageUrl) },
    { name: "minimax", fn: () => ocrWithMinimax(imageUrl) },
    { name: "textract", fn: () => ocrWithTextract(imageUrl) }
  ];

  let lastError: unknown;
  for (const { name, fn } of providers) {
    try {
      const result = await fn();
      logger.info({ provider: name, imageUrl }, "ocr.receipt.success");
      return result;
    } catch (err) {
      logger.warn({ provider: name, err }, "ocr.provider.failed");
      lastError = err;
    }
  }

  logger.error({ imageUrl, lastError }, "ocr.all.providers.failed");
  return { total: null, businessName: null, rawText: "", confidence: "low" };
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
  // Re-read the receipt inside the transaction to protect against concurrent
  // approval attempts. Wrapping the status check and all writes in a single
  // $transaction provides serialization: if two calls race, the second will
  // observe status !== "PENDING_REVIEW" and bail out safely. We do a quick
  // pre-flight check outside the transaction first to avoid acquiring a DB
  // connection for obviously invalid calls (e.g. already approved).
  const preCheck = await prisma.ocrReceipt.findUnique({
    where: { id: receiptId },
    select: { id: true, status: true }
  });

  if (!preCheck) throw new Error("Receipt not found.");
  if (preCheck.status !== "PENDING_REVIEW") {
    throw new Error(`Cannot approve receipt in status: ${preCheck.status}`);
  }

  await prisma.$transaction(async (tx) => {
    // Re-fetch inside the transaction for authoritative, serialised status check.
    // This is the idempotency guard: if a concurrent request already committed
    // an APPROVED update, we will see status !== "PENDING_REVIEW" here and
    // abort without creating a duplicate loyalty transaction.
    const receipt = await tx.ocrReceipt.findUnique({
      where: { id: receiptId },
      select: {
        id: true, businessId: true, userId: true, pointsToAward: true, status: true
      }
    });

    if (!receipt) throw new Error("Receipt not found.");
    if (receipt.status !== "PENDING_REVIEW") {
      // Already approved or rejected by a concurrent request — nothing to do.
      return;
    }

    const points = overridePoints ?? receipt.pointsToAward ?? 0;

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

export async function rejectOcrReceipt(receiptId: string, staffUserId: string) {
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
