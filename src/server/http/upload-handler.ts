import { randomUUID } from "node:crypto";

import { StaffRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { observeHttpRoute } from "@/lib/metrics";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { authenticateRequestUser } from "@/lib/request-auth";
import { requestIdHeader, resolveRequestId } from "@/lib/request-context";
import { getClientIp } from "@/lib/security";
import { createPresignedUpload, getStoredObjectUrl, storageConfigured } from "@/lib/storage";
import { requireRole } from "@/lib/staff";
import { prisma } from "@/lib/prisma";
import {
  createDocumentRecord,
  isAiWorkspaceServiceError,
  requestDocumentIngestion
} from "@/server/services/ai-workspace.service";

const UploadRequestSchema = z.object({
  businessId: z.string().min(1),
  title: z.string().min(1).max(160),
  filename: z.string().min(1).max(255),
  contentType: z.string().regex(/^[\w-]+\/[\w.+-]+$/),
  byteSize: z.number().int().min(1).max(50 * 1024 * 1024)
});

const ALLOWED_MIME = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

function buildStorageKey(input: { businessId: string; filename: string }) {
  const sanitized = input.filename.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `businesses/${input.businessId}/documents/${Date.now()}-${randomUUID()}-${sanitized}`;
}

export async function handleCreateUpload(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);

  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) {
    observeHttpRoute({
      route: "/api/upload",
      method: "POST",
      status: 403,
      durationMs: Date.now() - startedAt
    });
    return csrfFailure;
  }

  const session = await authenticateRequestUser(request.headers);
  if (!session?.userId) {
    observeHttpRoute({
      route: "/api/upload",
      method: "POST",
      status: 401,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401, headers: { [requestIdHeader]: requestId } }
    );
  }

  const ip = getClientIp(request.headers);
  const limit = await enforceRateLimit({
    identifier: `upload:${session.userId}:${ip}`,
    windowSeconds: 60,
    max: 10
  });
  if (!limit.allowed) {
    observeHttpRoute({
      route: "/api/upload",
      method: "POST",
      status: 429,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Too many upload requests." },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders(limit),
          [requestIdHeader]: requestId
        }
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    observeHttpRoute({
      route: "/api/upload",
      method: "POST",
      status: 400,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: { [requestIdHeader]: requestId } }
    );
  }

  const parsed = UploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    observeHttpRoute({
      route: "/api/upload",
      method: "POST",
      status: 400,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: { [requestIdHeader]: requestId } }
    );
  }

  if (!ALLOWED_MIME.has(parsed.data.contentType)) {
    observeHttpRoute({
      route: "/api/upload",
      method: "POST",
      status: 415,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "File type not supported." },
      { status: 415, headers: { [requestIdHeader]: requestId } }
    );
  }

  await requireRole({
    businessId: parsed.data.businessId,
    userId: session.userId,
    allowedRoles: [StaffRole.AI_TRAINER, StaffRole.MANAGER]
  });

  if (!storageConfigured()) {
    logger.warn(
      { userId: session.userId, filename: parsed.data.filename },
      "upload.storage_not_configured"
    );
    observeHttpRoute({
      route: "/api/upload",
      method: "POST",
      status: 503,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      {
        error:
          "Object storage is not yet configured for this environment. Set R2_* or MINIO_* environment variables."
      },
      { status: 503, headers: { [requestIdHeader]: requestId } }
    );
  }

  const storageKey = buildStorageKey({
    businessId: parsed.data.businessId,
    filename: parsed.data.filename
  });

  const upload = await createPresignedUpload({
    key: storageKey,
    contentType: parsed.data.contentType,
    byteSize: parsed.data.byteSize
  });

  let document;
  try {
    document = await createDocumentRecord({
      businessId: parsed.data.businessId,
      actorUserId: session.userId,
      title: parsed.data.title,
      fileName: parsed.data.filename,
      mimeType: parsed.data.contentType,
      storageKey,
      sizeBytes: parsed.data.byteSize,
      sourceUrl: getStoredObjectUrl(storageKey)
    });
  } catch (error) {
    if (isAiWorkspaceServiceError(error)) {
      observeHttpRoute({
        route: "/api/upload",
        method: "POST",
        status: error.status,
        durationMs: Date.now() - startedAt
      });
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: { [requestIdHeader]: requestId } }
      );
    }

    throw error;
  }

  observeHttpRoute({
    route: "/api/upload",
    method: "POST",
    status: 200,
    durationMs: Date.now() - startedAt
  });
  return NextResponse.json(
    {
      documentId: document.id,
      uploadUrl: upload.uploadUrl,
      uploadMethod: upload.method,
      uploadHeaders: upload.headers
    },
    {
      headers: {
        [requestIdHeader]: requestId
      }
    }
  );
}

export async function handleCompleteUpload(request: Request, documentId: string) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);

  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) {
    observeHttpRoute({
      route: "/api/upload/[documentId]/complete",
      method: "POST",
      status: 403,
      durationMs: Date.now() - startedAt
    });
    return csrfFailure;
  }

  const session = await authenticateRequestUser(request.headers);
  if (!session?.userId) {
    observeHttpRoute({
      route: "/api/upload/[documentId]/complete",
      method: "POST",
      status: 401,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401, headers: { [requestIdHeader]: requestId } }
    );
  }

  const document = await prisma.businessDocument.findUnique({
    where: { id: documentId }
  });

  if (!document) {
    observeHttpRoute({
      route: "/api/upload/[documentId]/complete",
      method: "POST",
      status: 404,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Document not found." },
      { status: 404, headers: { [requestIdHeader]: requestId } }
    );
  }

  await requireRole({
    businessId: document.businessId,
    userId: session.userId,
    allowedRoles: [StaffRole.AI_TRAINER, StaffRole.MANAGER]
  });

  let result;
  try {
    result = await requestDocumentIngestion(documentId, session.userId);
  } catch (error) {
    if (isAiWorkspaceServiceError(error)) {
      observeHttpRoute({
        route: "/api/upload/[documentId]/complete",
        method: "POST",
        status: error.status,
        durationMs: Date.now() - startedAt
      });
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: { [requestIdHeader]: requestId } }
      );
    }

    throw error;
  }

  observeHttpRoute({
    route: "/api/upload/[documentId]/complete",
    method: "POST",
    status: result.status === "processing" ? 202 : 200,
    durationMs: Date.now() - startedAt
  });

  return NextResponse.json(result, {
    status: result.status === "processing" ? 202 : 200,
    headers: { [requestIdHeader]: requestId }
  });
}
