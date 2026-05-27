import { NextResponse } from "next/server";

// Liveness probe: only checks that the Node.js process is alive.
// No DB or Redis probes — intentionally lightweight so a k8s/Docker
// health check never kills the pod due to a transient database hiccup.
// Use /api/health for readiness (all dependencies up).
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok", service: "heita-crm" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
