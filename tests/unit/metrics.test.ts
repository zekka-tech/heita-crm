import { describe, expect, it } from "vitest";

import {
  incrementAiChatMetric,
  incrementPosMetric,
  observeHttpRoute,
  renderMetrics
} from "@/lib/metrics";

describe("metrics registry", () => {
  it("renders custom route and product metrics", async () => {
    observeHttpRoute({
      route: "/api/test",
      method: "GET",
      status: 200,
      durationMs: 25
    });
    incrementAiChatMetric("ollama", "success");
    incrementPosMetric("accepted", "biz_123");

    const body = await renderMetrics();
    expect(body).toContain("heita_http_requests_total");
    expect(body).toContain('route="/api/test"');
    expect(body).toContain("heita_ai_chat_requests_total");
    expect(body).toContain("heita_pos_transactions_total");
  });
});
