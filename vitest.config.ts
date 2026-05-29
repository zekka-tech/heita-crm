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
      include: [
        "src/lib/phone.ts",
        "src/lib/security.ts",
        "src/lib/rate-limit.ts",
        "src/lib/otp.ts",
        "src/lib/qr.ts",
        "src/lib/logger.ts",
        "src/lib/billing.ts",
        "src/lib/csrf.ts",
        "src/lib/turnstile.ts",
        "src/server/services/loyalty.service.ts",
        "src/server/services/referral.service.ts",
        "src/server/services/customer-import.service.ts",
        "src/server/services/billing.service.ts",
        "src/server/services/receipt-history.service.ts",
        "src/server/http/webhook-handlers.ts",
        "src/server/http/metrics-handler.ts",
        "src/server/http/cron-handlers.ts",
        "src/app/api/webhooks/yoco/route.ts",
        "src/app/api/account/route.ts"
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80
      }
    }
  }
});
