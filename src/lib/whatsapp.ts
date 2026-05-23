const baseUrl = "https://graph.facebook.com";

export async function sendWhatsAppTextMessage(input: {
  phoneNumberId: string;
  to: string;
  body: string;
}) {
  const response = await fetch(
    `${baseUrl}/${process.env.WHATSAPP_API_VERSION ?? "v21.0"}/${input.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN ?? ""}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.to,
        type: "text",
        text: { body: input.body }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`WhatsApp send failed with status ${response.status}`);
  }

  return response.json();
}

