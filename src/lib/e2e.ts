/**
 * CI/E2E-only escape hatch for OTP UI tests that need a production build.
 * This is intentionally runtime-gated so Next.js cannot fold it away at build time.
 */
export function e2eDevOtpEnabled(): boolean {
  return process.env.E2E_EXPOSE_DEV_OTP === "1";
}
