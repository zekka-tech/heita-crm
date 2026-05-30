import type { NextRequest } from "next/server";

import { handleHealthRequest } from "@/server/http/health-handler";

export const dynamic = "force-dynamic";

// Readiness probe: checks DB, Redis, and storage. Returns 503 if any required
// dependency is unavailable. Use /api/health/live for a lightweight liveness check.
export function GET(request: NextRequest) {
  const url = new URL(request.url);
  url.searchParams.set("deep", "1");
  return handleHealthRequest(new Request(url, { headers: request.headers }));
}
