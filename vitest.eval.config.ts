import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Vitest config for the RAG evaluation harness (B5).
 * Run with: npm run test:eval
 *
 * Kept separate from the main unit-test config so:
 *  - The fast unit suite (npm test) is never slowed by eval fixtures
 *  - The eval can use different reporter / threshold settings
 *  - CI can run it as a non-blocking informational job
 */
export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "./src") }
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/ai/rag-eval/**/*.eval.ts"],
    reporters: ["verbose"],
    // Eval tests are allowed to fail without blocking CI — the report is
    // informational; regressions should be investigated, not always reverted.
    passWithNoTests: false
  }
});
