import { createHmac } from "node:crypto";

import { BusinessCategory, Province } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { prisma } from "../../src/lib/prisma";
import { createBusinessWithDefaults } from "../../src/server/services/business.service";

test("customer can sign in, join a business, and receive earned points", async ({
  page,
  request
}) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const ownerPhone = `+27830${suffix.slice(-6)}`;
  const customerPhone = `+27820${suffix.slice(-6)}`;
  const posSecret = process.env.POS_SHARED_SECRET ?? "e2e-pos-shared-secret";

  const owner = await prisma.user.create({
    data: {
      name: `Owner ${suffix}`,
      phone: ownerPhone,
      phoneVerifiedAt: new Date()
    }
  });

  const customer = await prisma.user.create({
    data: {
      name: `Customer ${suffix}`,
      phone: customerPhone,
      phoneVerifiedAt: new Date()
    }
  });

  const business = await createBusinessWithDefaults({
    userId: owner.id,
    name: `Wave 6 Test Store ${suffix}`,
    description: "End-to-end loyalty verification store",
    category: BusinessCategory.GROCERY,
    province: Province.GAUTENG,
    loyaltySignupBonus: 100
  });

  try {
    await page.goto("/sign-in");
    await page.getByLabel(/phone number/i).fill(customerPhone);
    await page.getByRole("button", { name: /send.*code/i }).click();

    const devOtpChip = page.getByText(/Dev OTP:\s*\d{6}/i);
    await expect(devOtpChip).toBeVisible();
    const devOtpText = await devOtpChip.textContent();
    const devOtp = devOtpText?.match(/(\d{6})/)?.[1];
    expect(devOtp).toBeTruthy();

    await page.getByLabel(/verification code|code/i).fill(devOtp!);
    await page.getByRole("button", { name: /verify and sign in|verify sign in/i }).click();
    await page.waitForURL(/\/home/);

    await page.goto(`/b/${business.slug}/join`);
    await page.getByRole("button", { name: /claim .* welcome points/i }).click();
    await page.waitForURL(/\/home\?joined=/);

    const payload = {
      businessSlug: business.slug,
      externalTransactionId: `e2e-pos-${suffix}`,
      phone: customerPhone,
      points: 120,
      description: "Playwright loyalty earn"
    };
    const rawBody = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", posSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    const posResponse = await request.post("/api/integrations/transactions", {
      headers: {
        "content-type": "application/json",
        "x-heita-timestamp": timestamp,
        "x-heita-signature": signature
      },
      data: rawBody
    });

    expect(posResponse.ok()).toBeTruthy();
    await page.goto("/wallet");
    await expect(page.getByText("220", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(new RegExp(business.name, "i"))).toBeVisible();
  } finally {
    await prisma.business.deleteMany({
      where: {
        id: business.id
      }
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [owner.id, customer.id]
        }
      }
    });
  }
});
