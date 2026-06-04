/**
 * CI/E2E-only escape hatch for OTP UI tests that need a production build.
 * Bracket notation prevents webpack DefinePlugin from inlining the value at
 * build time — ensures the running standalone server's env is checked, not the
 * build-time snapshot.
 */
export function e2eDevOtpEnabled(): boolean {
  return (process.env["E2E_EXPOSE_DEV_OTP"] as string | undefined) === "1";
}
