import { randomUUID } from "node:crypto";

import { StaffRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security";
import { createPresignedUpload, getStoredObjectUrl, storageConfigured } from "@/lib/storage";
import { requireRole } from "@/lib/staff";

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

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  const limit = await enforceRateLimit({
    identifier: `upload:${session.user.id}:${ip}`,
    windowSeconds: 60,
    max: 10
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many upload requests." },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = UploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!ALLOWED_MIME.has(parsed.data.contentType)) {
    return NextResponse.json({ error: "File type not supported." }, { status: 415 });
  }

  await requireRole({
    businessId: parsed.data.businessId,
    userId: session.user.id,
    allowedRoles: [StaffRole.AI_TRAINER, StaffRole.MANAGER]
  });

  if (!storageConfigured()) {
    logger.warn(
      { userId: session.user.id, filename: parsed.data.filename },
      "upload.storage_not_configured"
    );
    return NextResponse.json(
      {
        error:
          "Object storage is not yet configured for this environment. Set R2_* or MINIO_* environment variables."
      },
      { status: 503 }
    );
  }

  const workspace = await prisma.aiWorkspace.findUnique({
    where: { businessId: parsed.data.businessId }
  });

  if (!workspace) {
    return NextResponse.json({ error: "AI workspace not found." }, { status: 404 });
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

  const document = await prisma.businessDocument.create({
    data: {
      workspaceId: workspace.id,
      businessId: parsed.data.businessId,
      title: parsed.data.title,
      fileName: parsed.data.filename,
      mimeType: parsed.data.contentType,
      storageKey,
      sizeBytes: parsed.data.byteSize,
      sourceUrl: getStoredObjectUrl(storageKey)
    }
  });

  return NextResponse.json({
    documentId: document.id,
    uploadUrl: upload.uploadUrl,
    uploadMethod: upload.method,
    uploadHeaders: upload.headers
  });
}
