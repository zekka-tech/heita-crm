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
    headless: true,
    // Seed cookie consent so the fixed-position consent banner (which overlays
    // the lower viewport, covering primary CTAs like "Send code" on mobile)
    // does not intercept pointer events. This mirrors a returning, consented
    // user; no test asserts the banner, and a real first-time user simply
    // dismisses it before interacting.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${PORT}`,
          localStorage: [{ name: "heita-cookie-consent", value: "accepted" }]
        }
      ]
    }
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
    url: `http://localhost:${PORT}/api/health/live`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(PORT),
      HOSTNAME: "0.0.0.0",
      // next/standalone server.js sets NODE_ENV=production at startup,
      // so all production-required secrets must be provided even in CI test runs.
      POS_SHARED_SECRET: process.env.POS_SHARED_SECRET ?? "e2e-pos-shared-secret",
      METRICS_BEARER_TOKEN: process.env.METRICS_BEARER_TOKEN ?? "e2e-metrics-token",
      CRON_SECRET: process.env.CRON_SECRET ?? "e2e-cron-secret-not-for-prod-ci-only",
      TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY ?? "e2e-turnstile-key",
      OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      E2E_EXPOSE_DEV_OTP: "1"
    }
  }
});
