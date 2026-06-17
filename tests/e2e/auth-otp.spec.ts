import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { prisma } from "../../src/lib/prisma";
import { signInWithOtp } from "./helpers/auth";

async function getCsrfToken(request: APIRequestContext): Promise<string> {
  const response = await request.get("/sign-in");
  expect(response.ok()).toBeTruthy();
  const token = response.headers()["x-heita-csrf"] ?? "";
  expect(token).toBeTruthy();
  return token;
}

test("OTP endpoint rejects invalid phone numbers", async ({ request }) => {
  const csrfToken = await getCsrfToken(request);
  const response = await request.post("/api/auth/request-otp", {
    headers: { "x-heita-csrf": csrfToken },
    data: { phone: "not-a-phone", mode: "sign-up" }
  });
  expect([400, 403]).toContain(response.status());
});

test("OTP endpoint enforces rate limits on rapid requests", async ({ request }) => {
  const phone = "+27821234999";
  const csrfToken = await getCsrfToken(request);
  const first = await request.post("/api/auth/request-otp", {
    headers: { "x-heita-csrf": csrfToken },
    data: { phone, mode: "sign-up" }
  });
  expect([200, 429]).toContain(first.status());

  const second = await request.post("/api/auth/request-otp", {
    headers: { "x-heita-csrf": csrfToken },
    data: { phone, mode: "sign-up" }
  });
  if (first.status() === 200) {
    expect(second.status()).toBe(429);
  }
});

test("successful OTP sign-in redirects to /home", async ({ page }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  const phone = `+27800${suffix.slice(-6)}`;

  const user = await prisma.user.create({
    data: {
      name: `OTP Test User ${suffix}`,
      phone,
      phoneVerifiedAt: new Date()
    }
  });

  try {
    await signInWithOtp(page, phone);
    expect(page.url()).toMatch(/\/home/);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
