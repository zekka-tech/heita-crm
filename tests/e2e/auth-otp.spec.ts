import { expect, test } from "@playwright/test";

test("OTP endpoint rejects invalid phone numbers", async ({ request }) => {
  const response = await request.post("/api/auth/request-otp", {
    data: { phone: "not-a-phone", mode: "sign-up" }
  });
  expect(response.status()).toBe(400);
});

test("OTP endpoint enforces rate limits on rapid requests", async ({ request }) => {
  const phone = "+27821234999";
  const first = await request.post("/api/auth/request-otp", {
    data: { phone, mode: "sign-up" }
  });
  expect([200, 429]).toContain(first.status());

  const second = await request.post("/api/auth/request-otp", {
    data: { phone, mode: "sign-up" }
  });
  if (first.status() === 200) {
    expect(second.status()).toBe(429);
  }
});
