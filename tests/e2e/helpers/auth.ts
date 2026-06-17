import { expect } from "@playwright/test";
import type { Page, Response } from "@playwright/test";

/**
 * Shared, flake-resistant phone-OTP sign-in helpers for E2E specs.
 *
 * Historically each spec carried its own copy of `signInAs`/`readDevOtp`, and
 * two of them (loyalty-earn-redeem, sales-flow) drifted into a fragile pattern:
 * they read the dev OTP from the request-otp JSON body OR a 2s chip race, and
 * never waited for the phone field to render before `fill()`. Under a cold
 * standalone CI server that produced two intermittent failures — `fill` timing
 * out against an unhydrated/redirecting page, and `expect(devOtp).toBeTruthy()`
 * getting `undefined` when the chip had not rendered within 2s. Centralising the
 * logic here keeps every spec on the robust path.
 */

// Generous, bounded waits: long enough to absorb a cold standalone server under
// CI load, short enough to fail with a clear message instead of consuming the
// whole per-test budget.
const FIELD_TIMEOUT = 15_000;
const DEV_OTP_TIMEOUT = 15_000;
const REDIRECT_TIMEOUT = 30_000;

/**
 * Resolve the 6-digit dev OTP for an OTP flow (sign-in or staff step-up).
 *
 * Primary source is the JSON response's `devCode`, which is deterministic and
 * surfaced only under the `E2E_EXPOSE_DEV_OTP=1` affordance. If it is absent we
 * fall back to the on-screen "Dev OTP" chip using a web-first visibility wait
 * rather than a fixed short timeout.
 *
 * A missing `devCode` almost always means the request was rate-limited (429) or
 * hit the enumeration guard, so we assert the response was OK first to fail with
 * an actionable message instead of a bare `undefined`.
 */
export async function readDevOtp(page: Page, response: Response): Promise<string> {
  let devCode: string | undefined;
  try {
    const payload = (await response.json()) as { devCode?: string };
    devCode = payload.devCode;
  } catch {
    // Non-JSON body — fall through to the on-screen chip.
  }

  if (!devCode) {
    expect(
      response.ok(),
      `OTP request returned HTTP ${response.status()} without a devCode. ` +
        "A 429 means a rate limit fired (check OTP limits / seeded phone reuse); " +
        "a generic 200 means the enumeration guard rejected the phone."
    ).toBeTruthy();

    const chip = page.getByText(/Dev OTP:\s*\d{6}/i);
    await expect(chip).toBeVisible({ timeout: DEV_OTP_TIMEOUT });
    devCode = ((await chip.textContent()) ?? "").match(/(\d{6})/)?.[1];
  }

  expect(devCode, "Could not read the dev OTP from the response body or the chip").toBeTruthy();
  return devCode!;
}

/**
 * Request an OTP for `phone` on the current /sign-in page and return the
 * captured request-otp response so the caller can resolve the dev code.
 * Waits for the phone field to be actionable before filling it.
 */
export async function requestOtp(page: Page, phone: string): Promise<Response> {
  const phoneField = page.getByLabel(/phone number/i);
  await expect(phoneField).toBeVisible({ timeout: FIELD_TIMEOUT });
  await phoneField.fill(phone);

  const otpResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/request-otp") &&
      response.request().method() === "POST",
    { timeout: FIELD_TIMEOUT }
  );
  await page.getByRole("button", { name: /send.*code/i }).click();
  return otpResponse;
}

/**
 * Full phone-OTP sign-in. Safe to call more than once on the same page (specs
 * that sign in as multiple users in sequence): clears cookies first so an
 * existing session does not redirect /sign-in → /home before the form renders.
 * Cookie-consent lives in localStorage (storageState) and survives clearCookies.
 */
export async function signInWithOtp(page: Page, phone: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/sign-in");

  const otpResponse = await requestOtp(page, phone);
  const devOtp = await readDevOtp(page, await otpResponse);

  const codeField = page.getByLabel(/verification code|code/i);
  await expect(codeField).toBeVisible({ timeout: FIELD_TIMEOUT });
  await codeField.fill(devOtp);
  await page.getByRole("button", { name: /verify and sign in|verify sign in/i }).click();
  await page.waitForURL(/\/home/, { timeout: REDIRECT_TIMEOUT });
}
