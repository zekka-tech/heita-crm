import { DocumentStatus, type BusinessDocument } from "@prisma/client";

import { enqueueDocumentIngestion } from "@/lib/ai/document-processor";
import { prisma } from "@/lib/prisma";

export class AiWorkspaceServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "AiWorkspaceServiceError";
  }
}

export function isAiWorkspaceServiceError(
  error: unknown
): error is AiWorkspaceServiceError {
  return error instanceof AiWorkspaceServiceError;
}

type CreateDocumentRecordInput = {
  businessId: string;
  title: string;
  fileName: string;
  mimeType: string;
  storageKey: string;
  sizeBytes: number;
  sourceUrl?: string | null;
};

type RequestDocumentIngestionResult =
  | {
      status: "accepted";
      documentId: string;
      ingestion: Awaited<ReturnType<typeof enqueueDocumentIngestion>>;
    }
  | {
      status: "processing" | "ready";
      documentId: string;
      ingestion: null;
    };

export async function createDocumentRecord(
  input: CreateDocumentRecordInput
): Promise<BusinessDocument> {
  const workspace = await prisma.aiWorkspace.findUnique({
    where: { businessId: input.businessId },
    select: { id: true }
  });

  if (!workspace) {
    throw new AiWorkspaceServiceError(
      "AI workspace not found.",
      404,
      "AI_WORKSPACE_NOT_FOUND"
    );
  }

  return prisma.businessDocument.create({
    data: {
      workspaceId: workspace.id,
      businessId: input.businessId,
      title: input.title,
      fileName: input.fileName,
      mimeType: input.mimeType,
      storageKey: input.storageKey,
      sizeBytes: input.sizeBytes,
      sourceUrl: input.sourceUrl ?? null,
      status: DocumentStatus.PENDING
    }
  });
}

export async function requestDocumentIngestion(
  documentId: string
): Promise<RequestDocumentIngestionResult> {
  const document = await prisma.businessDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      status: true
    }
  });

  if (!document) {
    throw new AiWorkspaceServiceError(
      "Document not found.",
      404,
      "DOCUMENT_NOT_FOUND"
    );
  }

  if (document.status === DocumentStatus.PROCESSING) {
    return {
      status: "processing",
      documentId: document.id,
      ingestion: null
    };
  }

  if (document.status === DocumentStatus.READY) {
    return {
      status: "ready",
      documentId: document.id,
      ingestion: null
    };
  }

  if (document.status === DocumentStatus.FAILED) {
    await prisma.businessDocument.update({
      where: { id: document.id },
      data: {
        status: DocumentStatus.PENDING,
        errorMessage: null
      }
    });
  }

  const ingestion = await enqueueDocumentIngestion(document.id);

  return {
    status: "accepted",
    documentId: document.id,
    ingestion
  };
}
