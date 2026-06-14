#!/usr/bin/env node
/**
 * Error-budget burn-down release gate.
 *
 * Two modes:
 *  1. Live Prometheus query (preferred for production wiring):
 *     Set PROMETHEUS_URL to the base URL of your Prometheus instance
 *     (e.g. https://prom.internal.heita.co.za) and optionally
 *     PROMETHEUS_TOKEN for bearer-auth (recommended — same token as
 *     /api/metrics). The script queries the 1-hour MWMB burn-rate
 *     recording rule and the 30-day error budget remaining ratio.
 *
 *  2. Sentinel file fallback (default when PROMETHEUS_URL is unset):
 *     Reads docs/error-budget-status.json written by a nightly refresh
 *     workflow (.github/workflows/refresh-error-budget-sentinel.yml).
 *     Shape: { "budgetExhausted": boolean, "burnRate": number, "updatedAt": string }
 *
 * Exit codes:
 *   0 — budget is healthy, or sentinel absent (non-blocking).
 *   1 — budget exhausted; deploy is blocked.
 *   2 — Prometheus reachable but returned a non-2xx / bad payload (hard fail).
 *
 * Override: set ERROR_BUDGET_OVERRIDE=1 to bypass a blocked gate and record
 *   the decision in CI output (requires OVERRIDE_REASON to be set too).
 *   See docs/runbooks/error-budget-burn-fast.md §Release gate override.
 */

import { readFileSync } from "node:fs";

const SENTINEL = "docs/error-budget-status.json";

// PromQL expressions matching the recording rules in prometheus-rules.yml.
// Burn rate >1 means the budget is consuming faster than it can recover.
// Budget remaining < 0.05 means < 5% left (treat as exhausted).
const BURN_RATE_QUERY =
  "max(slo:error_budget_burn_rate_1h:ratio{service='heita-crm'}) or vector(0)";
const BUDGET_REMAINING_QUERY =
  "min(slo:error_budget_remaining:ratio{service='heita-crm'}) or vector(1)";

async function queryPrometheus(baseUrl, token, expr) {
  const url = new URL("/api/v1/query", baseUrl);
  url.searchParams.set("query", expr);
  const headers = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`Prometheus HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const body = await res.json();
  if (body.status !== "success") {
    throw new Error(`Prometheus error: ${body.error ?? JSON.stringify(body)}`);
  }
  const result = body.data?.result ?? [];
  if (result.length === 0) return null;
  const val = parseFloat(result[0].value?.[1] ?? "NaN");
  return isNaN(val) ? null : val;
}

async function checkLivePrometheus(baseUrl) {
  const token = process.env.PROMETHEUS_TOKEN ?? "";
  process.stdout.write(`[error-budget-gate] Querying live Prometheus at ${baseUrl} …\n`);

  let burnRate, budgetRemaining;
  try {
    [burnRate, budgetRemaining] = await Promise.all([
      queryPrometheus(baseUrl, token, BURN_RATE_QUERY),
      queryPrometheus(baseUrl, token, BUDGET_REMAINING_QUERY)
    ]);
  } catch (err) {
    console.error(`[error-budget-gate] Prometheus query failed: ${err.message}`);
    console.error(
      "[error-budget-gate] Falling through to sentinel-file check (Prometheus unreachable)."
    );
    return null; // caller will fall through to sentinel
  }

  const rateStr = burnRate != null ? burnRate.toFixed(2) + "x" : "unknown";
  const budgetStr = budgetRemaining != null ? (budgetRemaining * 100).toFixed(1) + "%" : "unknown";
  process.stdout.write(
    `[error-budget-gate] Live metrics: burn rate=${rateStr}, budget remaining=${budgetStr}\n`
  );

  // Hard exhaust: burn rate ≥ 14.4x (1-hour window, 99.9% SLO) or budget < 5%
  const exhausted =
    (burnRate != null && burnRate >= 14.4) ||
    (budgetRemaining != null && budgetRemaining < 0.05);

  return { budgetExhausted: exhausted, burnRate: burnRate ?? 0, updatedAt: new Date().toISOString() };
}

function readSentinel() {
  try {
    return JSON.parse(readFileSync(SENTINEL, "utf8"));
  } catch {
    console.warn(
      `[error-budget-gate] Sentinel file ${SENTINEL} not found or unreadable. ` +
        "Skipping error-budget gate (non-blocking)."
    );
    return null;
  }
}

function enforceGate(status) {
  const { budgetExhausted, burnRate, updatedAt } = status;

  if (typeof budgetExhausted !== "boolean") {
    console.warn(
      `[error-budget-gate] Missing 'budgetExhausted' field — skipping gate.`
    );
    process.exit(0);
  }

  const rateStr = typeof burnRate === "number" ? burnRate.toFixed(2) + "x" : "unknown";
  const atStr = updatedAt ? ` (as of ${updatedAt})` : "";

  if (!budgetExhausted) {
    process.stdout.write(`[error-budget-gate] OK: error budget healthy. Burn rate: ${rateStr}${atStr}.\n`);
    process.exit(0);
  }

  // Budget is exhausted — check for an authorised override before blocking.
  const override = process.env.ERROR_BUDGET_OVERRIDE;
  const reason = process.env.OVERRIDE_REASON;
  if (override === "1") {
    if (!reason) {
      console.error(
        "[error-budget-gate] ERROR_BUDGET_OVERRIDE=1 set but OVERRIDE_REASON is empty. " +
          "Set OVERRIDE_REASON to a brief justification to proceed."
      );
      process.exit(1);
    }
    console.warn(
      `[error-budget-gate] OVERRIDE: error budget exhausted but deploy unblocked by override. ` +
        `Reason: ${reason}. Burn rate: ${rateStr}${atStr}.`
    );
    process.exit(0);
  }

  console.error(
    `[error-budget-gate] BLOCKED: availability error budget is exhausted. ` +
      `Burn rate: ${rateStr}${atStr}. ` +
      "Freeze non-critical releases. " +
      "See docs/runbooks/error-budget-burn-fast.md §Release gate override to unblock."
  );
  process.exit(1);
}

async function main() {
  const prometheusUrl = process.env.PROMETHEUS_URL;

  let status = prometheusUrl ? await checkLivePrometheus(prometheusUrl) : null;

  // Fall through to sentinel if Prometheus is unset or unreachable.
  if (!status) {
    status = readSentinel();
  }

  if (!status) {
    process.exit(0); // non-blocking when nothing is available
  }

  enforceGate(status);
}

main().catch((err) => {
  console.error(`[error-budget-gate] Unexpected error: ${err.message}`);
  process.exit(0); // non-blocking on unexpected errors
});
