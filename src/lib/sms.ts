export async function sendOtpSms(input: { to: string; code: string }) {
  if (!process.env.AT_API_KEY) {
    return {
      provider: "development",
      to: input.to,
      body: `Your Heita verification code is ${input.code}.`
    };
  }

  const username = process.env.AT_USERNAME;
  if (!username) {
    throw new Error("AT_USERNAME is required when Africa's Talking is enabled.");
  }

  const body = `Your Heita verification code is ${input.code}.`;
  const form = new URLSearchParams({
    username,
    to: input.to,
    message: body
  });

  if (process.env.AT_SENDER_ID) {
    form.set("from", process.env.AT_SENDER_ID);
  }

  const response = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      Accept: "application/json",
      apiKey: process.env.AT_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString(),
    signal: AbortSignal.timeout(30_000)
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        SMSMessageData?: {
          Recipients?: Array<{
            status?: string;
            statusCode?: number;
            number?: string;
            messageId?: string;
          }>;
        };
      }
    | null;

  if (!response.ok) {
    throw new Error(`Africa's Talking SMS send failed with status ${response.status}.`);
  }

  const recipient = payload?.SMSMessageData?.Recipients?.[0];
  if (!recipient || recipient.status?.toLowerCase().includes("success") !== true) {
    throw new Error("Africa's Talking did not accept the OTP SMS for delivery.");
  }

  return {
    provider: "africas-talking",
    to: input.to,
    body,
    messageId: recipient.messageId ?? null
  };
}
