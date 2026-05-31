/**
 * E2E: Staff dashboard CRUD operations.
 *
 * Tests:
 *   1. Owner can sign in and see the dashboard overview.
 *   2. Owner can create a promotion via the dashboard.
 *   3. Owner can create an event via the dashboard.
 *   4. Promotions and events appear in the listing after creation.
 *   5. Non-staff user cannot access the dashboard (redirected).
 */

import { BusinessCategory, Province } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { prisma } from "../../src/lib/prisma";
import { createBusinessWithDefaults } from "../../src/server/services/business.service";

async function signInAs(
  page: import("@playwright/test").Page,
  phone: string
): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel(/phone number/i).fill(phone);
  await page.getByRole("button", { name: /send.*code/i }).click();

  const devOtpChip = page.getByText(/Dev OTP:\s*\d{6}/i);
  await expect(devOtpChip).toBeVisible({ timeout: 10_000 });
  const devOtpText = (await devOtpChip.textContent()) ?? "";
  const devOtp = devOtpText.match(/(\d{6})/)?.[1];
  expect(devOtp).toBeTruthy();

  await page.getByLabel(/verification code|code/i).fill(devOtp!);
  await page.getByRole("button", { name: /verify and sign in|verify sign in/i }).click();
  await page.waitForURL(/\/home/);
}

test.describe("dashboard overview", () => {
  test("owner sees dashboard with business name and metric cards", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const ownerPhone = `+27832${suffix.slice(-6)}`;

    const owner = await prisma.user.create({
      data: { name: `Owner ${suffix}`, phone: ownerPhone, phoneVerifiedAt: new Date() }
    });

    const business = await createBusinessWithDefaults({
      userId: owner.id,
      name: `Dashboard Store ${suffix}`,
      description: "Dashboard CRUD test store",
      category: BusinessCategory.OTHER,
      province: Province.WESTERN_CAPE,
      loyaltySignupBonus: 50
    });

    try {
      await signInAs(page, ownerPhone);
      await page.goto(`/dashboard/${business.id}`);

      // Business name should appear in the hero card
      await expect(page.getByText(business.name)).toBeVisible({ timeout: 10_000 });

      // Metric cards should be present
      await expect(page.getByText(/members/i).first()).toBeVisible();
    } finally {
      await prisma.business.deleteMany({ where: { id: business.id } });
      await prisma.user.deleteMany({ where: { id: owner.id } });
    }
  });
});

test.describe("promotions CRUD", () => {
  test("owner can create a promotion and it appears in the list", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const ownerPhone = `+27833${suffix.slice(-6)}`;

    const owner = await prisma.user.create({
      data: { name: `PromOwner ${suffix}`, phone: ownerPhone, phoneVerifiedAt: new Date() }
    });

    const business = await createBusinessWithDefaults({
      userId: owner.id,
      name: `Promo Store ${suffix}`,
      description: "Promo CRUD store",
      category: BusinessCategory.RESTAURANT,
      province: Province.GAUTENG,
      loyaltySignupBonus: 0
    });

    try {
      await signInAs(page, ownerPhone);
      await page.goto(`/dashboard/${business.id}/promotions`);

      const promoTitle = `E2E Promo ${suffix}`;

      // Fill in the new promotion form
      await page.getByLabel(/title/i).fill(promoTitle);
      await page.getByLabel(/description/i).fill("Playwright-created promotion");
      await page.getByRole("button", { name: /create|save|add promotion/i }).click();

      // The promotion should appear in the list
      await expect(page.getByText(promoTitle)).toBeVisible({ timeout: 10_000 });
    } finally {
      await prisma.promotion.deleteMany({ where: { businessId: business.id } });
      await prisma.business.deleteMany({ where: { id: business.id } });
      await prisma.user.deleteMany({ where: { id: owner.id } });
    }
  });
});

test.describe("events CRUD", () => {
  test("owner can create an event and it appears in the list", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const ownerPhone = `+27834${suffix.slice(-6)}`;

    const owner = await prisma.user.create({
      data: { name: `EventOwner ${suffix}`, phone: ownerPhone, phoneVerifiedAt: new Date() }
    });

    const business = await createBusinessWithDefaults({
      userId: owner.id,
      name: `Event Store ${suffix}`,
      description: "Event CRUD store",
      category: BusinessCategory.RESTAURANT,
      province: Province.GAUTENG,
      loyaltySignupBonus: 0
    });

    // A date 7 days from now in a format the date input accepts
    const futureDateStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16); // "YYYY-MM-DDTHH:MM"

    try {
      await signInAs(page, ownerPhone);
      await page.goto(`/dashboard/${business.id}/events`);

      const eventTitle = `E2E Event ${suffix}`;

      await page.getByLabel(/title/i).fill(eventTitle);
      await page.getByLabel(/description/i).fill("Playwright-created event");
      const startInput = page.getByLabel(/start(s at|s|date|time)/i).first();
      await startInput.fill(futureDateStr);
      await page.getByRole("button", { name: /create|save|add event/i }).click();

      await expect(page.getByText(eventTitle)).toBeVisible({ timeout: 10_000 });
    } finally {
      await prisma.event.deleteMany({ where: { businessId: business.id } });
      await prisma.business.deleteMany({ where: { id: business.id } });
      await prisma.user.deleteMany({ where: { id: owner.id } });
    }
  });
});

test.describe("access control", () => {
  test("unauthenticated user is redirected away from dashboard", async ({ page }) => {
    // Use a plausible but non-existent businessId — the redirect happens before
    // the DB lookup when there is no session.
    await page.goto("/dashboard/non-existent-business-id");
    await page.waitForURL(/\/sign-in/);
    expect(page.url()).toContain("/sign-in");
  });

  test("authenticated non-staff user is denied the dashboard", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const ownerPhone = `+27835${suffix.slice(-6)}`;
    const strangerPhone = `+27836${suffix.slice(-6)}`;

    const [owner, stranger] = await Promise.all([
      prisma.user.create({
        data: { name: `ACOwner ${suffix}`, phone: ownerPhone, phoneVerifiedAt: new Date() }
      }),
      prisma.user.create({
        data: { name: `Stranger ${suffix}`, phone: strangerPhone, phoneVerifiedAt: new Date() }
      })
    ]);

    const business = await createBusinessWithDefaults({
      userId: owner.id,
      name: `AC Store ${suffix}`,
      description: "Access control store",
      category: BusinessCategory.OTHER,
      province: Province.GAUTENG,
      loyaltySignupBonus: 0
    });

    try {
      // Sign in as the stranger (not a staff member of this business)
      await signInAs(page, strangerPhone);
      await page.goto(`/dashboard/${business.id}`);

      // Should either redirect to /sign-in or show a not-found/forbidden page
      const url = page.url();
      const isBlocked = url.includes("/sign-in") || url.includes("/not-found") || url.includes("/404");
      const has403 = await page.getByText(/forbidden|not found|unauthorized|access denied/i).isVisible().catch(() => false);
      expect(isBlocked || has403).toBeTruthy();
    } finally {
      await prisma.business.deleteMany({ where: { id: business.id } });
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, stranger.id] } } });
    }
  });
});
