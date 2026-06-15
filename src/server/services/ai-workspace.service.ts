import { DocumentStatus, type BusinessDocument } from "@prisma/client";

import { enqueueDocumentIngestion } from "@/lib/ai/document-processor";
import {
  MalwareScanError,
  scanStoredObjectForMalware
} from "@/lib/malware-scan";
import { withBusinessScope } from "@/lib/prisma";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

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
  actorUserId?: string | null;
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
  return withBusinessScope(input.businessId, async (tx) => {
    const workspace = await tx.aiWorkspace.findUnique({
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

    const document = await tx.businessDocument.create({
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

    if (input.actorUserId) {
      await recordStaffAuditLog(
        {
          businessId: input.businessId,
          actorUserId: input.actorUserId,
          action: "AI_DOCUMENT_CREATE",
          targetType: "BusinessDocument",
          targetId: document.id,
          metadata: {
            title: document.title,
            fileName: document.fileName,
            mimeType: document.mimeType,
            sizeBytes: document.sizeBytes
          }
        },
        tx
      );
    }

    return document;
  });
}

export async function requestDocumentIngestion(
  documentId: string,
  businessId: string,
  actorUserId?: string | null
): Promise<RequestDocumentIngestionResult> {
  const document = await withBusinessScope(businessId, (tx) =>
    tx.businessDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        businessId: true,
        status: true,
        storageKey: true,
        fileName: true
      }
    })
  );

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
    await withBusinessScope(document.businessId, (tx) =>
      tx.businessDocument.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.PENDING,
          errorMessage: null
        }
      })
    );
  }

  try {
    const scanResult = await scanStoredObjectForMalware({
      storageKey: document.storageKey,
      fileName: document.fileName
    });

    if (scanResult.verdict === "infected") {
      await withBusinessScope(document.businessId, (tx) =>
        tx.businessDocument.update({
          where: { id: document.id },
          data: {
            status: DocumentStatus.FAILED,
            errorMessage: "The document was rejected by the malware scanner."
          }
        })
      );

      throw new AiWorkspaceServiceError(
        "The uploaded document was rejected by the malware scanner.",
        422,
        "DOCUMENT_INFECTED"
      );
    }
  } catch (error) {
    if (error instanceof AiWorkspaceServiceError) {
      throw error;
    }

    if (error instanceof MalwareScanError) {
      await withBusinessScope(document.businessId, (tx) =>
        tx.businessDocument.update({
          where: { id: document.id },
          data: {
            status: DocumentStatus.FAILED,
            errorMessage: error.message
          }
        })
      );

      throw new AiWorkspaceServiceError(error.message, error.status, error.code);
    }

    throw error;
  }

  const ingestion = await enqueueDocumentIngestion(document.id, document.businessId);

  if (actorUserId) {
    await withBusinessScope(document.businessId, async (tx) => {
      await recordStaffAuditLog({
        businessId: document.businessId,
        actorUserId,
        action: "AI_DOCUMENT_INGEST_REQUEST",
        targetType: "BusinessDocument",
        targetId: document.id,
        metadata: {
          jobId: ingestion.jobId,
          previousStatus: document.status
        }
      }, tx);
    });
  }

  return {
    status: "accepted",
    documentId: document.id,
    ingestion
  };
}
