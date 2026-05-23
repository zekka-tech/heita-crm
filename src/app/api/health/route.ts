import { NextResponse } from "next/server";

import { getRedis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

type CheckResult = { ok: boolean; latencyMs?: number; error?: string };

async function checkDatabase(): Promise<CheckResult> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const redis = getRedis();
  if (!redis) return { ok: true };
  const started = Date.now();
  try {
    const pong = await redis.ping();
    return { ok: pong === "PONG", latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function GET() {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);

  const healthy = database.ok && redis.ok;
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      service: "heita-crm",
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
      checks: { database, redis },
      timestamp: new Date().toISOString()
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
