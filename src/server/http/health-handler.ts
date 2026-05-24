import { NextResponse } from "next/server";

import { anthropicConfigured } from "@/lib/ai/anthropic";
import { ollamaConfigured } from "@/lib/ai/ollama";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { requestIdHeader, resolveRequestId } from "@/lib/request-context";
import { checkStorageHealth } from "@/lib/storage";

type CheckResult = {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  detail?: string;
  configured?: boolean;
};

const PROBE_TIMEOUT_MS = 2000;

function timeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} probe timed out`)), PROBE_TIMEOUT_MS)
    )
  ]);
}

async function checkDatabase(): Promise<CheckResult> {
  const started = Date.now();
  try {
    await timeout(prisma.$queryRaw`SELECT 1`, "database");
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "unknown"
    };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const redis = getRedis();
  if (!redis) {
    return { ok: true, configured: false, detail: "redis not configured" };
  }
  const started = Date.now();
  try {
    const pong = await timeout(redis.ping(), "redis");
    return { ok: pong === "PONG", configured: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "unknown"
    };
  }
}

async function checkOllama(): Promise<CheckResult> {
  if (!ollamaConfigured()) {
    return { ok: true, configured: false, detail: "ollama not configured" };
  }
  const started = Date.now();
  try {
    const response = await fetch(`${process.env.OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    });
    return {
      ok: response.ok,
      configured: true,
      latencyMs: Date.now() - started,
      detail: response.ok ? undefined : `status ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "unknown"
    };
  }
}

async function checkAnthropic(): Promise<CheckResult> {
  if (!anthropicConfigured()) {
    return { ok: true, configured: false, detail: "anthropic not configured" };
  }
  return { ok: true, configured: true };
}

async function checkStorage(): Promise<CheckResult> {
  const result = await checkStorageHealth();
  if ("reason" in result && result.reason === "not_configured") {
    return { ok: true, configured: false, detail: "storage not configured" };
  }
  return {
    ok: result.ok,
    configured: true,
    latencyMs: result.latencyMs,
    detail: result.provider,
    error: result.ok ? undefined : "reason" in result ? result.reason : undefined
  };
}

export async function handleHealthRequest(request: Request) {
  const requestId = resolveRequestId(request.headers);
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "1";

  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const deepProbes = deep
    ? await Promise.all([checkOllama(), checkAnthropic(), checkStorage()])
    : [];
  const [ollama, anthropic, storage] = deep ? deepProbes : [undefined, undefined, undefined];

  const checks = {
    database,
    redis,
    ...(deep ? { ollama, anthropic, storage } : {})
  };

  const required = [database, redis];
  if (deep) {
    required.push(...deepProbes.filter((probe) => probe.configured !== false));
  }
  const healthy = required.every((check) => check.ok);

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      service: "heita-crm",
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
      checks,
      timestamp: new Date().toISOString()
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        [requestIdHeader]: requestId
      }
    }
  );
}
