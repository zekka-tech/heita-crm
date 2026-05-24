import { StaffRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { observeHttpRoute } from "@/lib/metrics";
import { enqueueDocumentIngestion } from "@/lib/ai/document-processor";
import { prisma } from "@/lib/prisma";
import { requestIdHeader, resolveRequestId } from "@/lib/request-context";
import { requireRole } from "@/lib/staff";

type CompleteUploadRouteProps = {
  params: Promise<{ documentId: string }>;
};

export async function POST(
  request: Request,
  { params }: CompleteUploadRouteProps
) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const session = await auth();
  if (!session?.user?.id) {
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

  const { documentId } = await params;
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
    userId: session.user.id,
    allowedRoles: [StaffRole.AI_TRAINER, StaffRole.MANAGER]
  });

  const result = await enqueueDocumentIngestion(documentId);

  observeHttpRoute({
    route: "/api/upload/[documentId]/complete",
    method: "POST",
    status: 200,
    durationMs: Date.now() - startedAt
  });
  return NextResponse.json(
    {
      status: "accepted",
      documentId,
      ingestion: result
    },
    {
      headers: {
        [requestIdHeader]: requestId
      }
    }
  );
}
