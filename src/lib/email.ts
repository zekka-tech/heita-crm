import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { appendTraceHeaders } from "@/lib/tracing";

type EmailTag = "auth" | "notification" | "marketing" | "account" | "system";

type EmailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

type EmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  tag?: EmailTag;
  userId?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
};

export function emailConfigured() {
  return Boolean(process.env.EMAIL_SERVER_PASSWORD && process.env.EMAIL_FROM);
}

async function hasMarketingConsent(userId: string): Promise<boolean> {
  try {
    const consent = await prisma.userConsent.findFirst({
      where: {
        userId,
        type: "EMAIL_MARKETING",
        revokedAt: null
      }
    });
    return consent !== null;
  } catch (error) {
    logger.error({ err: error, userId }, "email.consent_check_failed");
    return false;
  }
}

export async function sendEmail(input: EmailInput) {
  if (!emailConfigured()) {
    logger.info({ to: input.to, subject: input.subject }, "email.dev_mode_skip");
    return {
      provider: "development",
      to: input.to,
      subject: input.subject
    };
  }

  if (input.tag === "marketing" && input.userId) {
    const consented = await hasMarketingConsent(input.userId);
    if (!consented) {
      logger.warn(
        { userId: input.userId, to: input.to },
        "email.marketing_blocked_no_consent"
      );
      return {
        provider: "skipped",
        to: input.to,
        reason: "no_marketing_consent"
      };
    }
  }

  const headers: Record<string, string> = {
    "List-Unsubscribe": `<${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/email/unsubscribe?email=${encodeURIComponent(input.to)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
  };
  Object.assign(headers, input.headers ?? {});

  const body: Record<string, unknown> = {
    from: process.env.EMAIL_FROM,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
    headers
  };

  if (input.attachments?.length) {
    body.attachments = input.attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      content_type: attachment.contentType
    }));
  }

  if (input.tag) {
    body.tags = [{ name: "category", value: input.tag }];
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: appendTraceHeaders({
      Authorization: `Bearer ${process.env.EMAIL_SERVER_PASSWORD}`,
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    logger.error(
      { status: response.status, body: text.slice(0, 200) },
      "email.send_failed"
    );
    throw new Error(`Email send failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json();
}
