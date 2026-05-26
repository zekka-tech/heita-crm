import crypto from "node:crypto";

import type { NextApiRequest, NextApiResponse } from "next";

import { logger } from "@/lib/logger";
import { handleYocoWebhook } from "@/server/services/billing.service";

export const config = { api: { bodyParser: false } };

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const secret = process.env.YOCO_WEBHOOK_SECRET;
  if (!secret) {
    logger.error({}, "yoco.webhook.no_secret");
    return res.status(500).json({ error: "Webhook secret not configured." });
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["x-yoco-signature"] as string | undefined;

  if (!signature) {
    return res.status(401).json({ error: "Missing signature." });
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    logger.warn({}, "yoco.webhook.invalid_signature");
    return res.status(401).json({ error: "Invalid signature." });
  }

  let payload: { type: string; payload: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON." });
  }

  try {
    await handleYocoWebhook(payload as Parameters<typeof handleYocoWebhook>[0]);
    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error({ err, type: payload.type }, "yoco.webhook.handler_error");
    return res.status(500).json({ error: "Internal error." });
  }
}
