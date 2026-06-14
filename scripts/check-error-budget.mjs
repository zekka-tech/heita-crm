#!/usr/bin/env node
/**
 * Error-budget burn-down release gate.
 *
 * In CI/CD without a live Prometheus instance this script reads a sentinel
 * file written by a separate scrape job (e.g. a nightly cron that queries
 * the Prometheus HTTP API and commits/uploads the result).
 *
 * Sentinel file: docs/error-budget-status.json
 * Shape: { "budgetExhausted": boolean, "burnRate": number, "updatedAt": string }
 *
 * Exit codes:
 *   0 — budget is healthy OR sentinel file is absent (non-blocking until
 *       wired to a live Prometheus scrape job).
 *   1 — budget is exhausted; block the deploy.
 *
 * When PROMETHEUS_URL is set this script will, in future, query the live
 * Prometheus API directly. That path is not yet implemented because the
 * production Prometheus endpoint is not reachable from GitHub Actions runners.
 * See docs/runbooks/error-budget-burn-fast.md §Release gate for wiring notes.
 */

import { readFileSync } from "node:fs";

const SENTINEL = "docs/error-budget-status.json";

function main() {
  // Future: query live Prometheus when PROMETHEUS_URL is set.
  const prometheusUrl = process.env.PROMETHEUS_URL;
  if (prometheusUrl) {
    console.warn(
      `[error-budget-gate] PROMETHEUS_URL is set (${prometheusUrl}) but live Prometheus querying is not yet implemented. ` +
        "Falling through to sentinel-file check."
    );
  }

  let status;
  try {
    const raw = readFileSync(SENTINEL, "utf8");
    status = JSON.parse(raw);
  } catch {
    console.warn(
      `[error-budget-gate] Sentinel file ${SENTINEL} not found or unreadable. ` +
        "Skipping error-budget gate (non-blocking until live Prometheus wiring is complete)."
    );
    process.exit(0);
  }

  const { budgetExhausted, burnRate, updatedAt } = status;

  if (typeof budgetExhausted !== "boolean") {
    console.warn(
      `[error-budget-gate] ${SENTINEL} is missing required field 'budgetExhausted'. ` +
        "Skipping gate (treat as non-blocking)."
    );
    process.exit(0);
  }

  const rateStr = typeof burnRate === "number" ? burnRate.toFixed(2) + "x" : "unknown";
  const atStr = updatedAt ? ` (as of ${updatedAt})` : "";

  if (budgetExhausted) {
    console.error(
      `[error-budget-gate] BLOCKED: availability error budget is exhausted. ` +
        `Current burn rate: ${rateStr}${atStr}. ` +
        "Freeze non-critical releases until budget recovers. " +
        "See docs/runbooks/error-budget-burn-fast.md for remediation steps."
    );
    process.exit(1);
  }

  console.log(
    `[error-budget-gate] OK: error budget healthy. Burn rate: ${rateStr}${atStr}.`
  );
  process.exit(0);
}

main();
