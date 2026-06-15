import { StaffRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { observeHttpRoute } from "@/lib/metrics";
import { withBusinessScope } from "@/lib/prisma";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { authenticateRequestUser } from "@/lib/request-auth";
import { requestIdHeader, resolveRequestId } from "@/lib/request-context";
import { getClientIp } from "@/lib/security";
import { requireRole } from "@/lib/staff";
import { checkPlanLimit } from "@/server/services/billing.service";
import {
  createWebSource,
  deleteWebSource,
  isAiWorkspaceServiceError,
  refreshWebSource
} from "@/server/services/web-source.service";

const ALLOWED_ROLES = [StaffRole.AI_TRAINER, StaffRole.MANAGER] as const;

const CreateWebSourceSchema = z.object({
  businessId: z.string().min(1),
  rootUrl: z.string().url().max(2048),
  maxDepth: z.number().int().min(0).max(3).default(2),
  maxPages: z.number().int().min(1).max(50).default(25),
  refreshIntervalDays: z.number().int().min(0).max(365).default(0)
});

function json(body: unknown, status: number, requestId: string) {
  return NextResponse.json(body, { status, headers: { [requestIdHeader]: requestId } });
}

export async function handleCreateWebSource(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const route = "/api/ai/web-sources";

  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) {
    observeHttpRoute({ route, method: "POST", status: 403, durationMs: Date.now() - startedAt });
    return csrfFailure;
  }

  const session = await authenticateRequestUser(request.headers);
  if (!session?.userId) {
    observeHttpRoute({ route, method: "POST", status: 401, durationMs: Date.now() - startedAt });
    return json({ error: "Authentication required" }, 401, requestId);
  }

  const ip = getClientIp(request.headers);
  const limit = await enforceRateLimit({
    identifier: `web-source:${session.userId}:${ip}`,
    windowSeconds: 60,
    max: 5
  });
  if (!limit.allowed) {
    observeHttpRoute({ route, method: "POST", status: 429, durationMs: Date.now() - startedAt });
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { ...rateLimitHeaders(limit), [requestIdHeader]: requestId } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    observeHttpRoute({ route, method: "POST", status: 400, durationMs: Date.now() - startedAt });
    return json({ error: "Invalid JSON body." }, 400, requestId);
  }

  const parsed = CreateWebSourceSchema.safeParse(body);
  if (!parsed.success) {
    observeHttpRoute({ route, method: "POST", status: 400, durationMs: Date.now() - startedAt });
    return json({ error: "Invalid request." }, 400, requestId);
  }

  await requireRole({ businessId: parsed.data.businessId, userId: session.userId, allowedRoles: ALLOWED_ROLES });

  const planCheck = await checkPlanLimit(parsed.data.businessId, "documentUploadsPerMonth");
  if (!planCheck.allowed) {
    observeHttpRoute({ route, method: "POST", status: 429, durationMs: Date.now() - startedAt });
    return json(
      {
        error: `Document limit reached (${planCheck.current}/${planCheck.limit} this month). Upgrade your plan to add web sources.`
      },
      429,
      requestId
    );
  }

  try {
    const source = await createWebSource({
      businessId: parsed.data.businessId,
      actorUserId: session.userId,
      rootUrl: parsed.data.rootUrl,
      maxDepth: parsed.data.maxDepth,
      maxPages: parsed.data.maxPages,
      refreshIntervalDays: parsed.data.refreshIntervalDays
    });
    observeHttpRoute({ route, method: "POST", status: 202, durationMs: Date.now() - startedAt });
    return json(
      {
        webSource: {
          id: source.id,
          rootUrl: source.rootUrl,
          domain: source.domain,
          status: source.status,
          maxDepth: source.maxDepth,
          maxPages: source.maxPages,
          refreshIntervalDays: source.refreshIntervalDays
        }
      },
      202,
      requestId
    );
  } catch (error) {
    if (isAiWorkspaceServiceError(error)) {
      observeHttpRoute({ route, method: "POST", status: error.status, durationMs: Date.now() - startedAt });
      return json({ error: error.message }, error.status, requestId);
    }
    logger.error({ err: error, businessId: parsed.data.businessId }, "web-source.create.error");
    observeHttpRoute({ route, method: "POST", status: 502, durationMs: Date.now() - startedAt });
    return json({ error: "Unable to add web source right now." }, 502, requestId);
  }
}

async function authorizeSourceMutation(request: Request, id: string, requestId: string) {
  const session = await authenticateRequestUser(request.headers);
  if (!session?.userId) {
    return { error: json({ error: "Authentication required" }, 401, requestId) } as const;
  }

  const businessId = new URL(request.url).searchParams.get("businessId")?.trim() ?? "";
  if (!businessId) {
    return { error: json({ error: "businessId is required." }, 400, requestId) } as const;
  }

  await requireRole({ businessId, userId: session.userId, allowedRoles: ALLOWED_ROLES });

  const source = await withBusinessScope(businessId, (tx) =>
    tx.webSource.findUnique({ where: { id }, select: { businessId: true } })
  );
  if (!source || source.businessId !== businessId) {
    return { error: json({ error: "Web source not found." }, 404, requestId) } as const;
  }

  return { userId: session.userId, businessId } as const;
}

export async function handleDeleteWebSource(request: Request, id: string) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const route = "/api/ai/web-sources/[id]";

  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) {
    observeHttpRoute({ route, method: "DELETE", status: 403, durationMs: Date.now() - startedAt });
    return csrfFailure;
  }

  const auth = await authorizeSourceMutation(request, id, requestId);
  if ("error" in auth) return auth.error;

  await deleteWebSource({ id, businessId: auth.businessId, actorUserId: auth.userId });
  observeHttpRoute({ route, method: "DELETE", status: 200, durationMs: Date.now() - startedAt });
  return json({ ok: true }, 200, requestId);
}

export async function handleRefreshWebSource(request: Request, id: string) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const route = "/api/ai/web-sources/[id]/refresh";

  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) {
    observeHttpRoute({ route, method: "POST", status: 403, durationMs: Date.now() - startedAt });
    return csrfFailure;
  }

  const auth = await authorizeSourceMutation(request, id, requestId);
  if ("error" in auth) return auth.error;

  const source = await refreshWebSource({ id, businessId: auth.businessId });
  observeHttpRoute({ route, method: "POST", status: 202, durationMs: Date.now() - startedAt });
  return json({ ok: true, status: source.status }, 202, requestId);
}
