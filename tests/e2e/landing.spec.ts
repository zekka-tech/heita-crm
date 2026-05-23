import { expect, test } from "@playwright/test";

test.describe("Public landing experience", () => {
  test("renders the Stitch-inspired hero and primary CTAs", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: /Loyalty, messaging, and AI workspaces/i
      })
    ).toBeVisible();

    await expect(page.getByRole("link", { name: /Onboard your business/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign in/i })).toBeVisible();
  });

  test("sets security headers on the document response", async ({ request }) => {
    const response = await request.get("/");
    expect(response.ok()).toBeTruthy();

    const headers = response.headers();
    expect(headers["content-security-policy"]).toBeDefined();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("sign-in page renders the phone OTP form", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: /Sign in to Heita/i })).toBeVisible();
    await expect(page.getByLabel(/Phone number/i)).toBeVisible();
  });
});
