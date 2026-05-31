import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    headless: true
  },
  projects: [
    // Smoke suite: 4 critical flows that run on every PR (fast feedback).
    // Configured via PLAYWRIGHT_SMOKE=1 env var in CI.
    {
      name: "smoke",
      testMatch: [
        "**/auth-otp.spec.ts",
        "**/join-earn.spec.ts",
        "**/loyalty-earn-redeem.spec.ts"
      ],
      use: { ...devices["Pixel 7"] }
    },
    // Full suite: all devices, runs on main push only.
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] }
    },
    {
      name: "mobile-ios",
      use: { ...devices["iPhone 12"] }
    },
    {
      name: "tablet",
      use: { ...devices["iPad (gen 7)"] }
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    // `next start` does not work with `output: standalone` (Next.js 15+).
    // Build is done separately by the CI "Build for smoke/E2E" step;
    // we only start the pre-built standalone server here.
    command: process.env.CI
      ? `node .next/standalone/server.js`
      : "npm run build && node .next/standalone/server.js",
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(PORT),
      HOSTNAME: "0.0.0.0",
      POS_SHARED_SECRET: process.env.POS_SHARED_SECRET ?? "e2e-pos-shared-secret",
      E2E_EXPOSE_DEV_OTP: "1"
    }
  }
});
