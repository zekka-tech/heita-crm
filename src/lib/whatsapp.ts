const baseUrl = "https://graph.facebook.com";

export async function sendWhatsAppTextMessage(input: {
  phoneNumberId: string;
  to: string;
  body: string;
}) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is missing.");
  }

  const response = await fetch(
    `${baseUrl}/${process.env.WHATSAPP_API_VERSION ?? "v21.0"}/${input.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.to,
        type: "text",
        text: { body: input.body }
      }),
      signal: AbortSignal.timeout(30_000)
    }
  );

  if (!response.ok) {
    throw new Error(`WhatsApp send failed with status ${response.status}`);
  }

  return response.json();
}
