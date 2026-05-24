import { StaffRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getBuildPhaseRouteResponse } from "@/lib/build-phase";
import { csrfFailureResponse } from "@/lib/csrf";
import { observeHttpRoute } from "@/lib/metrics";
import { prisma } from "@/lib/prisma";
import { authenticateRequestUser } from "@/lib/request-auth";
import { requestIdHeader, resolveRequestId } from "@/lib/request-context";
import { requireRole } from "@/lib/staff";
import {
  isAiWorkspaceServiceError,
  requestDocumentIngestion
} from "@/server/services/ai-workspace.service";

type CompleteUploadRouteProps = {
  params: Promise<{ documentId: string }>;
};

export async function POST(
  request: Request,
  { params }: CompleteUploadRouteProps
) {
  const buildResponse = getBuildPhaseRouteResponse();
  if (buildResponse) return buildResponse;

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
  return NextResponse.json(
    result,
    {
      status: result.status === "processing" ? 202 : 200,
      headers: {
        [requestIdHeader]: requestId
      }
    }
  );
}
