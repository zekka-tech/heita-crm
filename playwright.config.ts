import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);

// Copy build-time static assets into the standalone output tree so the
// standalone server can serve them. Idempotent (mkdir -p + copy contents),
// so it is safe under Playwright's reuseExistingServer in local runs.
const copyStandaloneAssets = [
  "mkdir -p .next/standalone/.next/static",
  "cp -r .next/static/. .next/standalone/.next/static/",
  "mkdir -p .next/standalone/public",
  "cp -r public/. .next/standalone/public/"
].join(" && ");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  // Per-test budget. The default 30s is tight for flows that sign in (OTP
  // request + verify + redirect) and then do several authenticated steps against
  // the standalone build under CI load — the main remaining source of E2E flake
  // once per-IP OTP rate limiting was relaxed for E2E. Individual heavy specs
  // may still raise this further with test.setTimeout().
  timeout: 90_000,
  // Default assertion timeout: most specs already pass { timeout: 10_000 } to
  // toBeVisible/poll; make that the baseline so newly added expects don't flake
  // on the default 5s under CI load.
  expect: { timeout: 10_000 },
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
    //
    // The standalone server serves /_next/static and /public RELATIVE to
    // server.js (i.e. from .next/standalone/.next/static and
    // .next/standalone/public). `next build` leaves those assets in the
    // top-level .next/static and public dirs, so they must be copied in or
    // every JS chunk 404s — which silently breaks client hydration and makes
    // every interactive e2e/smoke test fail (button never enables, etc.).
    // This mirrors the COPY steps in the Dockerfile runner stage.
    command: process.env.CI
      ? `${copyStandaloneAssets} && node .next/standalone/server.js`
      : `npm run build && ${copyStandaloneAssets} && node .next/standalone/server.js`,
    url: `http://localhost:${PORT}/api/health/live`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      // When APP_DATABASE_URL is set (CI `e2e-app-role` job), boot the app under
      // the non-BYPASSRLS `heita_app` role so the whole suite exercises the
      // FORCE-RLS runtime path. Migrations/seed still run as the owner role via
      // the job-level DATABASE_URL. Unset locally → app inherits DATABASE_URL as
      // before, so default runs are unchanged.
      ...(process.env.APP_DATABASE_URL
        ? { DATABASE_URL: process.env.APP_DATABASE_URL }
        : {}),
      PORT: String(PORT),
      HOSTNAME: "0.0.0.0",
      // next/standalone server.js sets NODE_ENV=production at startup,
      // so all production-required secrets must be provided even in CI test runs.
      POS_SHARED_SECRET: process.env.POS_SHARED_SECRET ?? "e2e-pos-shared-secret",
      METRICS_BEARER_TOKEN: process.env.METRICS_BEARER_TOKEN ?? "e2e-metrics-token",
      CRON_SECRET: process.env.CRON_SECRET ?? "e2e-cron-secret-not-for-prod-ci-only",
      TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY ?? "e2e-turnstile-key",
      OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      // Production env validation (NODE_ENV=production under standalone server)
      // requires malware scanning to be enabled. No clamav daemon runs in CI,
      // but the e2e/smoke suites only assert auth rejection on upload endpoints
      // and never reach the scan path, so these satisfy validation harmlessly.
      MALWARE_SCAN_MODE: process.env.MALWARE_SCAN_MODE ?? "clamav",
      MALWARE_SCAN_REQUIRED: process.env.MALWARE_SCAN_REQUIRED ?? "1",
      E2E_EXPOSE_DEV_OTP: "1"
    }
  }
});
