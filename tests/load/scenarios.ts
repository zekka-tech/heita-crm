/**
 * Load/stress scenario definitions for the Heita CRM.
 *
 * These exercise the highest-risk public surfaces under concurrency to prove
 * the system degrades gracefully rather than falling over: the readiness probe,
 * the public discovery read path, the rate-limited OTP burst path, the
 * signature-verified webhook flood path, and the AI chat (SSE) entry point.
 *
 * Several scenarios deliberately target *rejection* paths (CSRF/auth 401/403,
 * bad-signature 400). That is intentional — an unauthenticated attacker can
 * only reach those branches, so their throughput/latency under flood is the
 * realistic resilience question. `acceptableStatuses` encodes which response
 * codes count as the system behaving correctly under load.
 *
 * Run against a deployed instance, never the dev server. See ./README.md.
 */

export interface LoadScenario {
  /** Stable CLI key, e.g. `npm run test:load -- health-ready`. */
  readonly name: string;
  /** One-line description shown in the runner output. */
  readonly description: string;
  /** Request path appended to the base URL. */
  readonly path: string;
  readonly method: "GET" | "POST";
  /** Static request body (stringified). Overridable per-run. */
  readonly body?: string;
  readonly headers?: Record<string, string>;
  /** Concurrent open connections (virtual users). */
  readonly connections: number;
  /** Test duration in seconds. */
  readonly duration: number;
  /** Pipelined requests per connection (1 = no pipelining). */
  readonly pipelining: number;
  /** HTTP status codes that mean "handled correctly under load". */
  readonly acceptableStatuses: readonly number[];
  /** Pass/fail gates evaluated against the autocannon result. */
  readonly thresholds: {
    /** Max acceptable p99 latency in milliseconds. */
    readonly maxLatencyP99Ms: number;
    /** Min acceptable sustained throughput (requests/sec, averaged). */
    readonly minThroughputRps: number;
    /**
     * Max fraction of responses outside `acceptableStatuses`, plus socket
     * errors and timeouts, as a share of total requests. 0.01 = 1%.
     */
    readonly maxErrorRate: number;
  };
}

// Default knobs are conservative so the harness is safe to point at staging
// without overwhelming it. Scale up via CLI flags for a real stress run.
export const scenarios: Record<string, LoadScenario> = {
  "health-ready": {
    name: "health-ready",
    description: "Readiness probe (DB + Redis + storage) under sustained load",
    path: "/api/health/ready",
    method: "GET",
    connections: 50,
    duration: 20,
    pipelining: 1,
    // 200 healthy, 503 if a dependency is down — both are correct handling.
    acceptableStatuses: [200, 503],
    thresholds: { maxLatencyP99Ms: 800, minThroughputRps: 200, maxErrorRate: 0.01 }
  },

  discover: {
    name: "discover",
    description: "Public business discovery read path (DB-backed) under load",
    path: "/api/discover/businesses?q=cafe",
    method: "GET",
    connections: 50,
    duration: 20,
    pipelining: 1,
    acceptableStatuses: [200],
    thresholds: { maxLatencyP99Ms: 1000, minThroughputRps: 150, maxErrorRate: 0.01 }
  },

  "otp-burst": {
    name: "otp-burst",
    description:
      "OTP request burst — proves CSRF/auth gate + rate limiter hold under flood (expects 401/403)",
    path: "/api/auth/request-staff-otp",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ businessId: "load-test" }),
    connections: 100,
    duration: 20,
    pipelining: 1,
    // Unauthenticated callers can only ever reach the CSRF/auth rejection.
    // 429 is also correct if rate limiting kicks in.
    acceptableStatuses: [401, 403, 429],
    thresholds: { maxLatencyP99Ms: 500, minThroughputRps: 300, maxErrorRate: 0.01 }
  },

  "webhook-flood": {
    name: "webhook-flood",
    description:
      "Bad-signature webhook flood — proves signature verification rejects fast under DoS (expects 400)",
    path: "/api/webhooks/stripe",
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": "t=0,v1=invalid" },
    body: JSON.stringify({ id: "evt_load", type: "noop" }),
    connections: 100,
    duration: 20,
    pipelining: 1,
    // Missing/invalid signature must be rejected. 400 expected; 401 acceptable.
    acceptableStatuses: [400, 401],
    thresholds: { maxLatencyP99Ms: 300, minThroughputRps: 400, maxErrorRate: 0.01 }
  },

  "ai-chat": {
    name: "ai-chat",
    description:
      "AI chat (SSE) entry point under concurrency — proves auth gate holds before token spend (expects 401)",
    path: "/api/ai/chat",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "load test ping", businessSlug: "load-test" }),
    connections: 25,
    duration: 20,
    pipelining: 1,
    // Without a session cookie the request is rejected before any model call.
    // Pass --cookie to load-test the authenticated streaming path instead.
    acceptableStatuses: [401, 403],
    thresholds: { maxLatencyP99Ms: 600, minThroughputRps: 100, maxErrorRate: 0.01 }
  }
};

export const scenarioNames = Object.keys(scenarios);
