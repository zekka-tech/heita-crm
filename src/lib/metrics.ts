import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics
} from "prom-client";

declare global {
  var __heitaMetricsRegistry__: Registry | undefined;
  var __heitaMetricsCollected__: boolean | undefined;
}

function getRegistry() {
  if (!global.__heitaMetricsRegistry__) {
    global.__heitaMetricsRegistry__ = new Registry();
  }

  if (!global.__heitaMetricsCollected__) {
    collectDefaultMetrics({
      register: global.__heitaMetricsRegistry__
    });
    global.__heitaMetricsCollected__ = true;
  }

  return global.__heitaMetricsRegistry__;
}

const registry = getRegistry();

function getOrCreateCounter(name: string, help: string, labelNames: string[] = []) {
  const existing = registry.getSingleMetric(name);
  if (existing) {
    return existing as Counter<string>;
  }
  return new Counter({ name, help, labelNames, registers: [registry] });
}

function getOrCreateGauge(name: string, help: string, labelNames: string[] = []) {
  const existing = registry.getSingleMetric(name);
  if (existing) {
    return existing as Gauge<string>;
  }
  return new Gauge({ name, help, labelNames, registers: [registry] });
}

function getOrCreateHistogram(name: string, help: string, labelNames: string[] = []) {
  const existing = registry.getSingleMetric(name);
  if (existing) {
    return existing as Histogram<string>;
  }
  return new Histogram({
    name,
    help,
    labelNames,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [registry]
  });
}

// ─── HTTP ──────────────────────────────────────────────────────────────────────

const httpRequestsTotal = getOrCreateCounter(
  "heita_http_requests_total",
  "HTTP requests handled",
  ["route", "method", "status"]
);

const httpRequestDurationSeconds = getOrCreateHistogram(
  "heita_http_request_duration_seconds",
  "HTTP request duration in seconds",
  ["route", "method", "status"]
);

const httpErrorsTotal = getOrCreateCounter(
  "heita_http_errors_total",
  "HTTP 5xx errors by route",
  ["route", "method", "status"]
);

// ─── Auth ──────────────────────────────────────────────────────────────────────

const authAttemptsTotal = getOrCreateCounter(
  "heita_auth_attempts_total",
  "Authentication attempts",
  ["method", "status"]
);

// ─── Loyalty ───────────────────────────────────────────────────────────────────

const loyaltyEventsTotal = getOrCreateCounter(
  "heita_loyalty_events_total",
  "Loyalty events processed",
  ["type", "business_id"]
);

// ─── AI ────────────────────────────────────────────────────────────────────────

const aiChatRequestsTotal = getOrCreateCounter(
  "heita_ai_chat_requests_total",
  "AI chat requests handled",
  ["runtime", "status"]
);

// ─── POS ───────────────────────────────────────────────────────────────────────

const posTransactionsTotal = getOrCreateCounter(
  "heita_pos_transactions_total",
  "POS transactions received",
  ["status", "business_id"]
);

// ─── Webhooks ──────────────────────────────────────────────────────────────────

const webhookEventsTotal = getOrCreateCounter(
  "heita_webhook_events_total",
  "Inbound webhook events processed",
  ["provider", "status"]
);

// ─── OTP / Auth / Bot ─────────────────────────────────────────────────────────

const otpRequestsTotal = getOrCreateCounter(
  "heita_otp_requests_total",
  "OTP code request attempts",
  ["result"]
);

const webhookAuthFailuresTotal = getOrCreateCounter(
  "heita_webhook_auth_failures_total",
  "Webhook HMAC or timestamp auth failures",
  ["provider"]
);

const redisErrorsTotal = getOrCreateCounter(
  "heita_redis_errors_total",
  "Redis errors that caused fail-closed rate limiting"
);

const turnstileFailuresTotal = getOrCreateCounter(
  "heita_turnstile_failures_total",
  "Cloudflare Turnstile bot-check failures"
);

// ─── Queues ────────────────────────────────────────────────────────────────────

const queueJobsTotal = getOrCreateCounter(
  "heita_queue_jobs_total",
  "Queue jobs processed by outcome",
  ["queue", "status"]
);

const dlqPendingJobs = getOrCreateGauge(
  "heita_dlq_pending_jobs",
  "Jobs currently waiting in dead-letter queues",
  ["queue"]
);

const dlqMovedTotal = getOrCreateCounter(
  "heita_dlq_jobs_moved_total",
  "Jobs moved to dead-letter queue",
  ["queue"]
);

// ─── Public API ────────────────────────────────────────────────────────────────

export function observeHttpRoute(input: {
  route: string;
  method: string;
  status: number;
  durationMs: number;
}) {
  const labels = {
    route: input.route,
    method: input.method,
    status: String(input.status)
  };
  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, input.durationMs / 1000);
  if (input.status >= 500) {
    httpErrorsTotal.inc(labels);
  }
}

export function incrementLoyaltyMetric(type: string, businessId: string) {
  loyaltyEventsTotal.inc({ type, business_id: businessId });
}

export function incrementAiChatMetric(runtime: string, status: string) {
  aiChatRequestsTotal.inc({ runtime, status });
}

export function incrementPosMetric(status: string, businessId: string) {
  posTransactionsTotal.inc({ status, business_id: businessId });
}

export function incrementAuthMetric(method: string, status: "success" | "failure") {
  authAttemptsTotal.inc({ method, status });
}

export function incrementOtpMetric(result: "ok" | "rate_limited" | "send_failed" | "enumeration_guard") {
  otpRequestsTotal.inc({ result });
}

export function incrementWebhookAuthFailure(provider: string) {
  webhookAuthFailuresTotal.inc({ provider });
}

export function incrementRedisError() {
  redisErrorsTotal.inc();
}

export function incrementTurnstileFailure() {
  turnstileFailuresTotal.inc();
}

export function incrementWebhookMetric(provider: string, status: string) {
  webhookEventsTotal.inc({ provider, status });
}

export function incrementQueueJobMetric(queue: string, status: string) {
  queueJobsTotal.inc({ queue, status });
}

export function setDlqPendingGauge(queue: string, count: number) {
  dlqPendingJobs.set({ queue }, count);
}

export function incrementDlqMovedCounter(queue: string) {
  dlqMovedTotal.inc({ queue });
}

export async function renderMetrics() {
  return registry.metrics();
}

export function metricsContentType() {
  return registry.contentType;
}
