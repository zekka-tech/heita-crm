/* eslint-disable no-console -- console output is this CLI tool's primary interface */
/**
 * Load/stress test runner for the Heita CRM.
 *
 *   npm run test:load -- <scenario|all> --url https://staging.example.com [flags]
 *
 * Flags:
 *   --url <base>          Target base URL (or set LOAD_TARGET_URL). REQUIRED.
 *   --connections <n>     Override concurrent connections for every scenario.
 *   --duration <secs>     Override duration for every scenario.
 *   --pipelining <n>      Override pipelined requests per connection.
 *   --cookie <value>      Cookie header (e.g. an authenticated session) added
 *                         to every request — use to load-test authed paths.
 *   --header "K: V"       Extra header (repeatable).
 *
 * No URL → prints usage and exits 0, so an accidental CI invocation is a no-op
 * rather than a failure. This harness is intentionally NOT part of `npm run ci`;
 * it must run against a deployed instance, never the dev server.
 */

import autocannon from "autocannon";

import { scenarios, scenarioNames, type LoadScenario } from "./scenarios";

interface ParsedArgs {
  targets: string[];
  url?: string;
  connections?: number;
  duration?: number;
  pipelining?: number;
  cookie?: string;
  extraHeaders: Record<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { targets: [], extraHeaders: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    const next = (): string => argv[(i += 1)] ?? "";
    switch (arg) {
      case "--url":
        parsed.url = next();
        break;
      case "--connections":
        parsed.connections = Number(next());
        break;
      case "--duration":
        parsed.duration = Number(next());
        break;
      case "--pipelining":
        parsed.pipelining = Number(next());
        break;
      case "--cookie":
        parsed.cookie = next();
        break;
      case "--header": {
        const raw = next();
        const idx = raw.indexOf(":");
        if (idx > 0) parsed.extraHeaders[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
        break;
      }
      default:
        if (!arg.startsWith("--")) parsed.targets.push(arg);
    }
  }
  return parsed;
}

function printUsage(): void {
  console.log(
    [
      "Heita load/stress harness",
      "",
      "Usage: npm run test:load -- <scenario|all> --url <base-url> [flags]",
      "",
      `Scenarios: ${scenarioNames.join(", ")}, all`,
      "",
      "Set --url or LOAD_TARGET_URL to a DEPLOYED instance (not the dev server).",
      "See tests/load/README.md for details."
    ].join("\n")
  );
}

// autocannon's runtime result exposes per-status counts; the bundled @types
// don't surface statusCodeStats, so we narrow it explicitly.
interface RunResult extends autocannon.Result {
  statusCodeStats?: Record<string, { count: number }>;
}

interface Evaluation {
  scenario: string;
  passed: boolean;
  failures: string[];
  p99: number;
  rps: number;
  errorRate: number;
  total: number;
}

function evaluate(scenario: LoadScenario, result: RunResult): Evaluation {
  const total = result.requests.total || 0;
  const acceptable = new Set(scenario.acceptableStatuses.map(String));

  let unacceptable = 0;
  if (result.statusCodeStats) {
    for (const [code, { count }] of Object.entries(result.statusCodeStats)) {
      if (!acceptable.has(code)) unacceptable += count;
    }
  } else {
    // Fallback: approximate from the bucketed counters when stats are absent.
    const bucketByPrefix: Record<string, number> = {
      "1": result["1xx"],
      "2": result["2xx"],
      "3": result["3xx"],
      "4": result["4xx"],
      "5": result["5xx"]
    };
    const acceptedPrefixes = new Set(
      scenario.acceptableStatuses.map((s) => String(s)[0])
    );
    for (const [prefix, count] of Object.entries(bucketByPrefix)) {
      if (!acceptedPrefixes.has(prefix)) unacceptable += count;
    }
  }

  // Error rate folds in unexpected statuses plus transport-level failures.
  const errorRate = total > 0 ? (unacceptable + (result.errors || 0) + (result.timeouts || 0)) / total : 1;
  const p99 = result.latency.p99;
  const rps = result.requests.average;

  const failures: string[] = [];
  if (p99 > scenario.thresholds.maxLatencyP99Ms) {
    failures.push(`p99 latency ${p99}ms > ${scenario.thresholds.maxLatencyP99Ms}ms`);
  }
  if (rps < scenario.thresholds.minThroughputRps) {
    failures.push(`throughput ${rps.toFixed(0)} rps < ${scenario.thresholds.minThroughputRps} rps`);
  }
  if (errorRate > scenario.thresholds.maxErrorRate) {
    failures.push(
      `error rate ${(errorRate * 100).toFixed(2)}% > ${(scenario.thresholds.maxErrorRate * 100).toFixed(2)}%`
    );
  }

  return { scenario: scenario.name, passed: failures.length === 0, failures, p99, rps, errorRate, total };
}

async function runScenario(
  scenario: LoadScenario,
  args: ParsedArgs
): Promise<Evaluation> {
  const base = args.url!.replace(/\/$/, "");
  const headers: Record<string, string> = { ...scenario.headers, ...args.extraHeaders };
  if (args.cookie) headers.cookie = args.cookie;

  console.log(`\n▶ ${scenario.name}: ${scenario.description}`);

  const result = (await autocannon({
    url: `${base}${scenario.path}`,
    method: scenario.method,
    body: scenario.body,
    headers,
    connections: args.connections ?? scenario.connections,
    duration: args.duration ?? scenario.duration,
    pipelining: args.pipelining ?? scenario.pipelining
  })) as RunResult;

  const evaluation = evaluate(scenario, result);
  console.log(
    `  ${evaluation.passed ? "✓ PASS" : "✗ FAIL"} — ${evaluation.total} reqs, ` +
      `${evaluation.rps.toFixed(0)} rps, p99 ${evaluation.p99}ms, ` +
      `err ${(evaluation.errorRate * 100).toFixed(2)}%`
  );
  for (const failure of evaluation.failures) console.log(`     ✗ ${failure}`);
  return evaluation;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  args.url = args.url ?? process.env.LOAD_TARGET_URL;

  if (!args.url || args.targets.length === 0) {
    printUsage();
    // Exit 0 so a CI run without a target is a safe no-op, not a failure.
    process.exit(0);
  }

  const selected =
    args.targets.includes("all") ? scenarioNames : args.targets.filter((t) => t in scenarios);

  const unknown = args.targets.filter((t) => t !== "all" && !(t in scenarios));
  if (unknown.length > 0) {
    console.error(`Unknown scenario(s): ${unknown.join(", ")}`);
    console.error(`Available: ${scenarioNames.join(", ")}, all`);
    process.exit(2);
  }

  console.log(`Target: ${args.url}`);
  const results: Evaluation[] = [];
  for (const name of selected) {
    const scenario = scenarios[name];
    if (!scenario) continue;
    results.push(await runScenario(scenario, args));
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Summary: ${results.length - failed.length}/${results.length} scenarios passed`);
  if (failed.length > 0) {
    console.log(`Failed: ${failed.map((r) => r.scenario).join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Load run crashed:", err);
  process.exit(1);
});
