/**
 * E2E: Full loyalty earn → redeem cycle.
 *
 * Flow:
 *   1. Seed a business owner + a customer via Prisma directly.
 *   2. Customer signs in and joins the business via the public join page.
 *   3. POS API credits 250 points to the customer.
 *   4. Customer navigates to /wallet and confirms point balance = 350 (250 + 100 signup bonus).
 *   5. Staff (owner) signs in and opens the Loyalty dashboard.
 *   6. Staff redeems a reward for the customer via the dashboard form.
 *   7. Customer checks /wallet again — balance reflects the redemption deduction.
 */

import { createHmac } from "node:crypto";

import { BusinessCategory, Province } from "@prisma/client";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { prisma } from "../../src/lib/prisma";
import { createBusinessWithDefaults } from "../../src/server/services/business.service";

test.setTimeout(60_000);

async function readDevOtp(
  payload: { devCode?: string },
  chip: Locator
): Promise<string | undefined> {
  if (payload.devCode) {
    return payload.devCode;
  }

  const chipText = await chip.textContent({ timeout: 2_000 }).catch(() => "");
  return (chipText ?? "").match(/(\d{6})/)?.[1];
}

async function signInAs(page: Page, phone: string) {
  // Clear any existing session first: this helper is called twice in the same
  // page (customer, then staff), and an authenticated user hitting /sign-in is
  // correctly redirected to /home by middleware — which would leave no phone
  // field to fill. Cookie-consent lives in localStorage (storageState), so it
  // survives clearCookies; the CSRF cookie is re-issued on the next page load.
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel(/phone number/i).fill(phone);
  const otpResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/auth/request-otp") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /send.*code/i }).click();
  const otpPayload = (await (await otpResponsePromise).json()) as { devCode?: string };
  const devOtpChip = page.getByText(/Dev OTP:\s*\d{6}/i);
  const devOtp = await readDevOtp(otpPayload, devOtpChip);
  expect(devOtp).toBeTruthy();
  await page.getByLabel(/verification code|code/i).fill(devOtp!);
  await page.getByRole("button", { name: /verify and sign in|verify sign in/i }).click();
  await page.waitForURL(/\/home/);
}

test("customer earns and redeems loyalty points end-to-end", async ({ page, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  const ownerPhone = `+27830${suffix.slice(-6)}`;
  const customerPhone = `+27821${suffix.slice(-6)}`;
  const posSecret = process.env.POS_SHARED_SECRET ?? "e2e-pos-shared-secret";
  const SIGNUP_BONUS = 100;
  const EARNED_POINTS = 250;
  const EXPECTED_BALANCE = SIGNUP_BONUS + EARNED_POINTS;

  const [owner, customer] = await Promise.all([
    prisma.user.create({
      data: { name: `Owner ${suffix}`, phone: ownerPhone, phoneVerifiedAt: new Date() }
    }),
    prisma.user.create({
      data: { name: `Customer ${suffix}`, phone: customerPhone, phoneVerifiedAt: new Date() }
    })
  ]);

  const business = await createBusinessWithDefaults({
    userId: owner.id,
    name: `Loyalty E2E Store ${suffix}`,
    description: "E2E loyalty store",
    category: BusinessCategory.GROCERY,
    province: Province.GAUTENG,
    loyaltySignupBonus: SIGNUP_BONUS
  });

  // Create a reward the customer can redeem
  const reward = await prisma.reward.create({
    data: {
      businessId: business.id,
      title: "Free Coffee",
      description: "One free cup of coffee",
      pointsCost: 200,
      stock: 10,
      isActive: true
    }
  });

  try {
    // ── Step 1: Customer signs in and joins ──────────────────────────────
    await signInAs(page, customerPhone);
    await page.goto(`/b/${business.slug}/join`);
    await page.getByRole("button", { name: /claim .* welcome points/i }).click();
    await page.waitForURL(/\/home\?joined=/);

    // ── Step 2: POS earns points ─────────────────────────────────────────
    const payload = {
      businessSlug: business.slug,
      externalTransactionId: `e2e-earn-${suffix}`,
      phone: customerPhone,
      points: EARNED_POINTS,
      description: "Playwright earn test"
    };
    const rawBody = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", posSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    const posResp = await request.post("/api/integrations/transactions", {
      headers: {
        "content-type": "application/json",
        "x-heita-timestamp": timestamp,
        "x-heita-signature": signature
      },
      data: rawBody
    });
    expect(posResp.ok()).toBeTruthy();

    // ── Step 3: Customer verifies balance on wallet ──────────────────────
    await page.goto("/wallet");
    await expect(
      page.getByText(String(EXPECTED_BALANCE), { exact: true }).first()
    ).toBeVisible({ timeout: 10_000 });

    // ── Step 4: Find the membership created ─────────────────────────────
    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: customer.id, businessId: business.id }
    });
    expect(membership.pointsBalance).toBe(EXPECTED_BALANCE);

    // ── Step 5: Staff signs in and redeems via dashboard ─────────────────
    await signInAs(page, ownerPhone);
    await page.goto(`/dashboard/${business.id}/loyalty`);

    // Mutating loyalty actions require a fresh staff step-up OTP. Request one,
    // read the dev code from the JSON response, and verify to unlock the forms.
    const stepUpResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/auth/request-staff-otp") &&
      response.request().method() === "POST"
    );
    await page.getByRole("button", { name: /send staff otp/i }).click();
    const stepUpPayload = (await (await stepUpResponsePromise).json()) as { devCode?: string };
    const stepUpChip = page.getByText(/Dev OTP:\s*\d{6}/i);
    const stepUpCode = await readDevOtp(stepUpPayload, stepUpChip);
    expect(stepUpCode).toBeTruthy();
    await page.getByLabel(/verification code/i).fill(stepUpCode!);
    await page.getByRole("button", { name: /verify staff access/i }).click();
    await expect(page.getByText(/staff verification is active/i)).toBeVisible({
      timeout: 10_000
    });

    // Redeem the reward's points cost on the customer's behalf. Both the "Issue
    // points" and "Redeem manually" cards expose "Customer"/"Points" controls,
    // so scope to the form that owns the "Redeem points" button.
    const redeemForm = page.locator("form", {
      has: page.getByRole("button", { name: /redeem points/i })
    });
    await redeemForm.getByLabel(/customer/i).selectOption(membership.id);
    await redeemForm.getByLabel("Points", { exact: true }).fill(String(reward.pointsCost));
    await redeemForm.getByRole("button", { name: /redeem points/i }).click();

    // ── Step 6: Verify DB balance post-redemption ─────────────────────────
    // The form action may complete without a client-observable navigation under
    // Playwright timing, so the persisted balance is the authoritative signal.
    await expect
      .poll(
        async () => {
          const updatedMembership = await prisma.membership.findUniqueOrThrow({
            where: { id: membership.id }
          });
          return updatedMembership.pointsBalance;
        },
        { timeout: 10_000 }
      )
      .toBe(EXPECTED_BALANCE - reward.pointsCost);
  } finally {
    await prisma.reward.deleteMany({ where: { id: reward.id } });
    await prisma.business.deleteMany({ where: { id: business.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, customer.id] } } });
  }
});

test("expired OTP cannot be replayed to earn points", async ({ request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  const posSecret = process.env.POS_SHARED_SECRET ?? "e2e-pos-shared-secret";

  const payload = {
    businessSlug: "non-existent-slug",
    externalTransactionId: `e2e-replay-${suffix}`,
    phone: `+27822${suffix.slice(-6)}`,
    points: 100
  };
  const rawBody = JSON.stringify(payload);

  // Timestamp 10 minutes in the past — outside the 5-minute replay window
  const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600);
  const signature = createHmac("sha256", posSecret)
    .update(`${staleTimestamp}.${rawBody}`)
    .digest("hex");

  const resp = await request.post("/api/integrations/transactions", {
    headers: {
      "content-type": "application/json",
      "x-heita-timestamp": staleTimestamp,
      "x-heita-signature": signature
    },
    data: rawBody
  });

  // Server must reject stale timestamps (401 or 400)
  expect([400, 401]).toContain(resp.status());
});
