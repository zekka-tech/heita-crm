/**
 * E2E: Responsive layout — no content overflow / text overlap.
 *
 * Guards against the class of bug where a long token (e.g. the hero "WhatsApp"
 * stat) renders wider than its container and overlaps a neighbour. Runs across
 * every Playwright project (mobile / mobile-ios / tablet / desktop), so a single
 * spec exercises all breakpoints.
 *
 * For each route it asserts:
 *   1. No page-level horizontal scroll (document wider than the viewport).
 *   2. No text element whose own content overflows its box while overflow-x is
 *      visible (the precise condition that causes neighbouring text to overlap).
 *
 * Authenticated routes reuse the dev-OTP sign-in used by the other specs.
 */

import { BusinessCategory, Province } from "@prisma/client";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { prisma } from "../../src/lib/prisma";
import { createBusinessWithDefaults } from "../../src/server/services/business.service";

// ── Overflow detector (runs in the page) ───────────────────────────────────────
async function findOverflows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = [];
    const viewport = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > viewport + 2) {
      offenders.push(
        `page has horizontal scroll: scrollWidth ${document.documentElement.scrollWidth}px > viewport ${viewport}px`
      );
    }

    const TEXT_SELECTOR = "h1,h2,h3,h4,h5,p,span,a,button,li,td,th,label,strong,em";
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(TEXT_SELECTOR))) {
      const style = getComputedStyle(el);
      // Clipped / scrollable boxes overflow on purpose — only visible overflow
      // can overlap a sibling.
      if (style.overflowX !== "visible") continue;
      // Only flag elements that directly hold text; layout wrappers whose
      // children overflow are caught by the page-level check above.
      const hasOwnText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0
      );
      if (!hasOwnText) continue;

      const overflow = el.scrollWidth - el.clientWidth;
      if (overflow > 2 && el.clientWidth > 0) {
        const text = (el.textContent ?? "").trim().slice(0, 40);
        offenders.push(`<${el.tagName.toLowerCase()}> "${text}" overflows its box by ${overflow}px`);
      }
    }
    return offenders;
  });
}

async function expectNoOverflow(page: Page, route: string): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  // Allow fonts/layout to settle so width measurements are final.
  await page.waitForTimeout(350);
  const offenders = await findOverflows(page);
  expect(offenders, `Layout overflow on ${route}:\n  - ${offenders.join("\n  - ")}`).toEqual([]);
}

async function signInAs(page: Page, phone: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel(/phone number/i).fill(phone);
  await page.getByRole("button", { name: /send code/i }).click();

  const devOtpChip = page.getByText(/Dev OTP:\s*\d{6}/i);
  await expect(devOtpChip).toBeVisible({ timeout: 10_000 });
  const devOtp = ((await devOtpChip.textContent()) ?? "").match(/(\d{6})/)?.[1];
  expect(devOtp).toBeTruthy();

  await page.getByLabel(/verification code|code/i).fill(devOtp!);
  await page.getByRole("button", { name: /verify and sign in|verify sign in/i }).click();
  await page.waitForURL(/\/home/);
}

// ── Public routes (no session) ──────────────────────────────────────────────────
const PUBLIC_ROUTES = [
  "/",
  "/discover",
  "/pricing",
  "/sign-in",
  "/onboard",
  "/categories",
  "/terms",
  "/privacy"
];

test.describe("responsive layout — public routes", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`no overflow on ${route}`, async ({ page }) => {
      await page.goto(route);
      await expectNoOverflow(page, route);
    });
  }
});

// ── Authenticated routes (owner session, real business) ──────────────────────────
test.describe.serial("responsive layout — authenticated routes", () => {
  // Generous ceiling so first-hit route compilation in `next dev` can't time
  // out the sign-in hook or a cold navigation. In CI the e2e job runs a
  // production build, so routes are pre-compiled and tests finish in ~1-2s.
  test.describe.configure({ timeout: 120_000 });

  let context: BrowserContext;
  let page: Page;
  let ownerId: string | undefined;
  let businessId: string | undefined;
  let slug: string | undefined;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000); // cold `next dev` compile of sign-in + home
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const ownerPhone = `+27870${suffix.slice(-6)}`;

    const owner = await prisma.user.create({
      data: { name: `Overflow Owner ${suffix}`, phone: ownerPhone, phoneVerifiedAt: new Date() }
    });
    ownerId = owner.id;

    const business = await createBusinessWithDefaults({
      userId: owner.id,
      name: `Overflow Store ${suffix}`,
      description: "Responsive overflow audit store",
      category: BusinessCategory.RESTAURANT,
      province: Province.GAUTENG,
      loyaltySignupBonus: 50
    });
    businessId = business.id;
    slug = business.slug;

    context = await browser.newContext();
    page = await context.newPage();
    await signInAs(page, ownerPhone);
  });

  test.afterAll(async () => {
    await context?.close();
    if (businessId) await prisma.business.deleteMany({ where: { id: businessId } });
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  });

  const APP_ROUTES = ["/home", "/wallet", "/notifications", "/profile", "/profile/consents"];
  for (const route of APP_ROUTES) {
    test(`no overflow on app ${route}`, async () => {
      await page.goto(route);
      await expectNoOverflow(page, route);
    });
  }

  const DASHBOARD_SUBROUTES = [
    "",
    "/analytics",
    "/customers",
    "/promotions",
    "/events",
    "/loyalty",
    "/messages",
    "/receipt-review",
    "/ai-workspace",
    "/settings",
    "/settings/billing",
    "/settings/staff"
  ];
  for (const sub of DASHBOARD_SUBROUTES) {
    test(`no overflow on dashboard${sub || "/"}`, async () => {
      const route = `/dashboard/${businessId}${sub}`;
      await page.goto(route);
      await expectNoOverflow(page, route);
    });
  }

  const BUSINESS_SUBROUTES = ["", "/rewards", "/join", "/events", "/history"];
  for (const sub of BUSINESS_SUBROUTES) {
    test(`no overflow on business${sub || "/"}`, async () => {
      const route = `/b/${slug}${sub}`;
      await page.goto(route);
      await expectNoOverflow(page, route);
    });
  }
});
