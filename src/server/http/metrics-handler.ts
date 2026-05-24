import { NextResponse } from "next/server";

import { metricsContentType, renderMetrics } from "@/lib/metrics";
import { requestIdHeader, resolveRequestId } from "@/lib/request-context";

export async function handleMetricsRequest(request: Request) {
  const requestId = resolveRequestId(request.headers);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.METRICS_BEARER_TOKEN;

  if (process.env.NODE_ENV === "production" && !expected) {
    return NextResponse.json(
      { error: "Metrics endpoint is not configured." },
      { status: 503, headers: { [requestIdHeader]: requestId } }
    );
  }

  if (expected && token !== expected) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { [requestIdHeader]: requestId } }
    );
  }

  const body = await renderMetrics();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": metricsContentType(),
      "Cache-Control": "no-store",
      [requestIdHeader]: requestId
    }
  });
}
