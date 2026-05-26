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
        "src/server/services/loyalty.service.ts",
        "src/server/services/referral.service.ts",
        "src/server/services/customer-import.service.ts"
      ],
      thresholds: {
        lines: 60,
        branches: 50,
        functions: 60,
        statements: 60
      }
    }
  }
});
