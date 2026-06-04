/**
 * Cross-tenant isolation tests.
 *
 * Creates two businesses (Biz A and Biz B) with separate manager accounts.
 * Signs in as Biz A's manager, then attempts to access Biz B's dashboard
 * routes. Every request must be rejected with a 403 or redirected away.
 */
import { expect, test } from "@playwright/test";

import { prisma } from "../../src/lib/prisma";

const DASH_ROUTES = [
  "",
  "/loyalty",
  "/loyalty/earn-points",
  "/loyalty/rewards",
  "/loyalty/tiers",
  "/messaging",
  "/ai-workspace",
  "/analytics",
  "/receipt-review",
  "/events",
  "/promotions",
  "/settings",
  "/settings/staff"
];

test.describe("cross-tenant isolation", () => {
  let bizAId: string;
  let bizBId: string;
  let managerAPhone: string;
  let managerBPhone: string;

  test.beforeAll(async () => {
    const suffix = Date.now();

    managerAPhone = `+27800${String(suffix).slice(-6)}`;
    managerBPhone = `+27801${String(suffix).slice(-6)}`;

    const userA = await prisma.user.create({
      data: {
        name: `Manager A ${suffix}`,
        phone: managerAPhone,
        phoneVerifiedAt: new Date()
      }
    });

    const userB = await prisma.user.create({
      data: {
        name: `Manager B ${suffix}`,
        phone: managerBPhone,
        phoneVerifiedAt: new Date()
      }
    });

    const businessA = await prisma.business.create({
      data: {
        name: `Biz A ${suffix}`,
        slug: `biz-a-${suffix}`,
        category: "OTHER",
        province: "GAUTENG",
        staffMembers: {
          create: { userId: userA.id, role: "OWNER" }
        }
      }
    });

    const businessB = await prisma.business.create({
      data: {
        name: `Biz B ${suffix}`,
        slug: `biz-b-${suffix}`,
        category: "OTHER",
        province: "GAUTENG",
        staffMembers: {
          create: { userId: userB.id, role: "OWNER" }
        }
      }
    });

    bizAId = businessA.id;
    bizBId = businessB.id;
  });

  test.afterAll(async () => {
    // Clean up test data — order matters for FK constraints
    await prisma.staffMember.deleteMany({ where: { businessId: { in: [bizAId, bizBId] } } });
    await prisma.business.deleteMany({ where: { id: { in: [bizAId, bizBId] } } });
    await prisma.user.deleteMany({ where: { phone: { in: [managerAPhone, managerBPhone] } } });
  });

  test("manager of Biz A is redirected away from all Biz B dashboard routes", async ({
    page
  }) => {
    // Sign in as Manager A using dev OTP flow
    await page.goto("/sign-in");
    await page.getByLabel(/phone number/i).fill(managerAPhone);
    await page.getByRole("button", { name: /send.*code/i }).click();

    // Dev mode exposes OTP on the page
    const otpEl = page.getByText(/Dev OTP:\s*\d{6}/i);
    await expect(otpEl).toBeVisible({ timeout: 10_000 });
    const otpText = (await otpEl.textContent()) ?? "";
    const otp = otpText.match(/(\d{6})/)?.[1];
    expect(otp).toBeTruthy();

    await page.getByLabel(/verification code|code/i).fill(otp!);
    await page.getByRole("button", { name: /verify and sign in|verify sign in/i }).click();
    await page.waitForURL(/\/(home|dashboard)/, { timeout: 15_000 });

    // Now try to access each Biz B route
    for (const route of DASH_ROUTES) {
      const url = `/dashboard/${bizBId}${route}`;
      const response = await page.goto(url);

      // Either the server responds with 403, or the page redirects to a
      // non-Biz-B URL (e.g. /dashboard/select-business or /home).
      const finalUrl = page.url();
      const statusOk = response?.status() === 403;
      const redirectedAway =
        !finalUrl.includes(bizBId) &&
        (finalUrl.includes("/dashboard") || finalUrl.includes("/home") || finalUrl.includes("/sign-in"));

      expect(
        statusOk || redirectedAway,
        `Route ${url} should be blocked but got status ${response?.status()} → ${finalUrl}`
      ).toBe(true);
    }
  });
});
