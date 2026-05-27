import { expect, test } from "@playwright/test";

test("OCR receipt upload endpoint rejects unauthenticated requests", async ({ request }) => {
  const response = await request.post("/api/receipts/upload", {
    headers: { "Content-Type": "application/json" },
    data: { businessId: "fake", imageUrl: "https://example.com/receipt.jpg" }
  });
  // Must require auth — 401 or redirect to sign-in
  expect([401, 302, 403]).toContain(response.status());
});

test("OCR receipt approval endpoint rejects unauthenticated requests", async ({ request }) => {
  const response = await request.post("/api/receipts/approve", {
    headers: { "Content-Type": "application/json" },
    data: { receiptId: "fake_id" }
  });
  expect([401, 302, 403]).toContain(response.status());
});

test("receipt history download requires auth", async ({ request }) => {
  const response = await request.get("/api/account/receipt-history?businessId=test");
  expect([401, 302, 403]).toContain(response.status());
});
