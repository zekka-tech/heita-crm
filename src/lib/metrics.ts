import {
  Counter,
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

  return new Counter({
    name,
    help,
    labelNames,
    registers: [registry]
  });
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
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [registry]
  });
}

const httpRequestsTotal = getOrCreateCounter("heita_http_requests_total", "HTTP requests handled", [
  "route",
  "method",
  "status"
]);

const httpRequestDurationSeconds = getOrCreateHistogram(
  "heita_http_request_duration_seconds",
  "HTTP request duration in seconds",
  ["route", "method", "status"]
);

const loyaltyEventsTotal = getOrCreateCounter("heita_loyalty_events_total", "Loyalty events processed", [
  "type",
  "business_id"
]);

const aiChatRequestsTotal = getOrCreateCounter("heita_ai_chat_requests_total", "AI chat requests handled", [
  "runtime",
  "status"
]);

const posTransactionsTotal = getOrCreateCounter(
  "heita_pos_transactions_total",
  "POS transactions received",
  ["status", "business_id"]
);

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

export async function renderMetrics() {
  return registry.metrics();
}

export function metricsContentType() {
  return registry.contentType;
}
