import { appendTraceHeaders } from "@/lib/tracing";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export function emailConfigured() {
  return Boolean(process.env.EMAIL_SERVER_PASSWORD && process.env.EMAIL_FROM);
}

export async function sendEmail(input: SendEmailInput) {
  if (!emailConfigured()) {
    return {
      provider: "development",
      to: input.to,
      subject: input.subject
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: appendTraceHeaders({
      Authorization: `Bearer ${process.env.EMAIL_SERVER_PASSWORD}`,
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text
    }),
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Email send failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json();
}
