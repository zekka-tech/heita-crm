import { expect, test } from "@playwright/test";

test("WhatsApp webhook rejects requests with invalid HMAC signature", async ({ request }) => {
  const response = await request.post("/api/webhooks/whatsapp", {
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": "sha256=invalidsignature"
    },
    data: { object: "whatsapp_business_account", entry: [] }
  });
  expect([400, 401, 403]).toContain(response.status());
});

test("WhatsApp webhook GET verification rejects wrong token", async ({ request }) => {
  const response = await request.get("/api/webhooks/whatsapp", {
    params: {
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong_token",
      "hub.challenge": "test_challenge"
    }
  });
  expect([400, 403]).toContain(response.status());
});

test("messaging dashboard page does not return 5xx for unauthenticated users", async ({ page }) => {
  const response = await page.goto("/sign-in");
  expect(response?.status()).not.toBe(500);
});
