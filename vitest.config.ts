import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src")
    }
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "tests/unit/**/*.{test,spec}.{ts,tsx}"
    ],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      // Security-critical files whose coverage is actively tracked.
      // Files with 0% coverage (no unit tests exist) are excluded from the
      // aggregate so they don't mask regressions in well-tested files.
      include: [
        "src/lib/phone.ts",
        "src/lib/security.ts",
        "src/lib/rate-limit.ts",
        "src/lib/otp.ts",
        "src/lib/qr.ts",
        "src/lib/billing.ts",
        "src/lib/csrf.ts",
        "src/lib/turnstile.ts",
        "src/server/services/loyalty.service.ts",
        "src/server/services/referral.service.ts",
        "src/server/services/billing.service.ts",
        "src/server/services/receipt-history.service.ts",
        "src/server/services/account.service.ts",
        "src/server/services/session.service.ts",
        "src/server/http/webhook-handlers.ts",
        "src/server/http/cron-handlers.ts",
        "src/app/api/webhooks/yoco/route.ts"
      ],
      thresholds: {
        lines: 55,
        branches: 48,
        functions: 60,
        statements: 55
      }
    }
  }
});
