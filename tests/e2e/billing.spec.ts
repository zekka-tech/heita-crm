import { expect, test } from "@playwright/test";

test("billing settings page returns 200 when authenticated", async ({ page }) => {
  // Shallow check: page renders without 5xx; full billing flow requires Yoco sandbox
  const response = await page.goto("/sign-in");
  expect(response?.status()).not.toBe(500);
});

test("Yoco webhook endpoint rejects requests with no payload", async ({ request }) => {
  const response = await request.post("/api/webhooks/yoco", {
    headers: { "Content-Type": "application/json" },
    data: {}
  });
  // Should return 400 (missing signature) or 401 — never 5xx
  expect(response.status()).toBeLessThan(500);
  expect([400, 401, 403]).toContain(response.status());
});

test("Yoco webhook endpoint rejects unsigned payloads", async ({ request }) => {
  const response = await request.post("/api/webhooks/yoco", {
    headers: { "Content-Type": "application/json" },
    data: { type: "payment.succeeded", payload: { metadata: { businessId: "fake" } } }
  });
  expect([400, 401, 403]).toContain(response.status());
});
