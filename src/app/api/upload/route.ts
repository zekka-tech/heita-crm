import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security";

const UploadRequestSchema = z.object({
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
    return NextResponse.json(
      { error: "File type not supported." },
      { status: 415 }
    );
  }

  const storageConfigured =
    Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_BUCKET_NAME) ||
    Boolean(process.env.MINIO_ACCESS_KEY && process.env.MINIO_BUCKET);

  if (!storageConfigured) {
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

  // Stub for presigned URL generation. Production wiring expects @aws-sdk/client-s3.
  return NextResponse.json(
    {
      error:
        "Presigned upload not yet wired in this build. @aws-sdk/client-s3 integration is intentionally deferred to keep the install lean."
    },
    { status: 501 }
  );
}
