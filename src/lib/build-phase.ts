import { NextResponse } from "next/server";

export function isBuildPhase() {
  return (
    process.env.HEITA_BUILD_PHASE === "1" ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  );
}

export function getBuildPhaseRouteResponse() {
  if (!isBuildPhase()) {
    return null;
  }

  return new NextResponse(null, { status: 204 });
}
