import { DocumentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  $transaction: vi.fn(),
  aiWorkspace: {
    findUnique: vi.fn()
  },
  businessDocument: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  },
  staffAuditLog: {
    create: vi.fn()
  }
};

const enqueueDocumentIngestion = vi.fn();
const scanStoredObjectForMalware = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma
}));

vi.mock("@/lib/ai/document-processor", () => ({
  enqueueDocumentIngestion
}));

vi.mock("@/lib/malware-scan", () => ({
  MalwareScanError: class MalwareScanError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly code: string
    ) {
      super(message);
      this.name = "MalwareScanError";
    }
  },
  scanStoredObjectForMalware
}));

const {
  createDocumentRecord,
  requestDocumentIngestion
} = await import("@/server/services/ai-workspace.service");

describe("ai workspace service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) =>
      callback(prisma)
    );
    scanStoredObjectForMalware.mockResolvedValue({
      verdict: "clean",
      details: "stream: OK"
    });
  });

  it("creates a pending document record for an existing workspace", async () => {
    prisma.aiWorkspace.findUnique.mockResolvedValue({ id: "workspace_123" });
    prisma.businessDocument.create.mockResolvedValue({
      id: "document_123",
      status: DocumentStatus.PENDING
    });

    const result = await createDocumentRecord({
      businessId: "business_123",
      title: "Retail FAQ",
      fileName: "faq.pdf",
      mimeType: "application/pdf",
      storageKey: "businesses/business_123/documents/faq.pdf",
      sizeBytes: 2048,
      sourceUrl: "https://files.example.com/faq.pdf"
    });

    expect(prisma.businessDocument.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_123",
        businessId: "business_123",
        title: "Retail FAQ",
        fileName: "faq.pdf",
        mimeType: "application/pdf",
        storageKey: "businesses/business_123/documents/faq.pdf",
        sizeBytes: 2048,
        sourceUrl: "https://files.example.com/faq.pdf",
        status: DocumentStatus.PENDING
      }
    });
    expect(result).toMatchObject({
      id: "document_123",
      status: DocumentStatus.PENDING
    });
  });

  it("records a staff audit entry when a staff actor creates a document", async () => {
    prisma.aiWorkspace.findUnique.mockResolvedValue({ id: "workspace_123" });
    prisma.businessDocument.create.mockResolvedValue({
      id: "document_123",
      title: "Retail FAQ",
      fileName: "faq.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      status: DocumentStatus.PENDING
    });

    await createDocumentRecord({
      businessId: "business_123",
      actorUserId: "staff_123",
      title: "Retail FAQ",
      fileName: "faq.pdf",
      mimeType: "application/pdf",
      storageKey: "businesses/business_123/documents/faq.pdf",
      sizeBytes: 2048
    });

    expect(prisma.staffAuditLog.create).toHaveBeenCalledWith({
      data: {
        businessId: "business_123",
        actorUserId: "staff_123",
        action: "AI_DOCUMENT_CREATE",
        targetType: "BusinessDocument",
        targetId: "document_123",
        metadata: {
          title: "Retail FAQ",
          fileName: "faq.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048
        }
      }
    });
  });

  it("rejects document creation when the AI workspace does not exist", async () => {
    prisma.aiWorkspace.findUnique.mockResolvedValue(null);

    await expect(
      createDocumentRecord({
        businessId: "business_123",
        title: "Retail FAQ",
        fileName: "faq.pdf",
        mimeType: "application/pdf",
        storageKey: "businesses/business_123/documents/faq.pdf",
        sizeBytes: 2048
      })
    ).rejects.toMatchObject({
      status: 404,
      code: "AI_WORKSPACE_NOT_FOUND"
    });
  });

  it("does not requeue documents that are already processing", async () => {
    prisma.businessDocument.findUnique.mockResolvedValue({
      id: "document_123",
      businessId: "business_123",
      status: DocumentStatus.PROCESSING,
      storageKey: "documents/document_123.pdf",
      fileName: "document_123.pdf"
    });

    const result = await requestDocumentIngestion("document_123");

    expect(result).toEqual({
      status: "processing",
      documentId: "document_123",
      ingestion: null
    });
    expect(enqueueDocumentIngestion).not.toHaveBeenCalled();
    expect(scanStoredObjectForMalware).not.toHaveBeenCalled();
  });

  it("clears failed status before retrying document ingestion", async () => {
    prisma.businessDocument.findUnique.mockResolvedValue({
      id: "document_123",
      businessId: "business_123",
      status: DocumentStatus.FAILED,
      storageKey: "documents/document_123.pdf",
      fileName: "document_123.pdf"
    });
    enqueueDocumentIngestion.mockResolvedValue({
      enqueued: true,
      mode: "queue",
      documentId: "document_123",
      jobId: "job_123"
    });

    const result = await requestDocumentIngestion("document_123");

    expect(prisma.businessDocument.update).toHaveBeenCalledWith({
      where: { id: "document_123" },
      data: {
        status: DocumentStatus.PENDING,
        errorMessage: null
      }
    });
    expect(scanStoredObjectForMalware).toHaveBeenCalledWith({
      storageKey: "documents/document_123.pdf",
      fileName: "document_123.pdf"
    });
    expect(enqueueDocumentIngestion).toHaveBeenCalledWith("document_123");
    expect(result).toEqual({
      status: "accepted",
      documentId: "document_123",
      ingestion: {
        enqueued: true,
        mode: "queue",
        documentId: "document_123",
        jobId: "job_123"
      }
    });
  });

  it("records a staff audit entry when ingestion is requested by staff", async () => {
    prisma.businessDocument.findUnique.mockResolvedValue({
      id: "document_123",
      businessId: "business_123",
      status: DocumentStatus.PENDING,
      storageKey: "documents/document_123.pdf",
      fileName: "document_123.pdf"
    });
    enqueueDocumentIngestion.mockResolvedValue({
      enqueued: true,
      mode: "queue",
      documentId: "document_123",
      jobId: "job_123"
    });

    await requestDocumentIngestion("document_123", "staff_123");

    expect(prisma.staffAuditLog.create).toHaveBeenCalledWith({
      data: {
        businessId: "business_123",
        actorUserId: "staff_123",
        action: "AI_DOCUMENT_INGEST_REQUEST",
        targetType: "BusinessDocument",
        targetId: "document_123",
        metadata: {
          jobId: "job_123",
          previousStatus: DocumentStatus.PENDING
        }
      }
    });
  });

  it("rejects infected documents before queueing ingestion", async () => {
    prisma.businessDocument.findUnique.mockResolvedValue({
      id: "document_123",
      businessId: "business_123",
      status: DocumentStatus.PENDING,
      storageKey: "documents/document_123.pdf",
      fileName: "document_123.pdf"
    });
    scanStoredObjectForMalware.mockResolvedValue({
      verdict: "infected",
      details: "stream: Eicar-Test-Signature FOUND"
    });

    await expect(requestDocumentIngestion("document_123")).rejects.toMatchObject({
      status: 422,
      code: "DOCUMENT_INFECTED"
    });

    expect(prisma.businessDocument.update).toHaveBeenCalledWith({
      where: { id: "document_123" },
      data: {
        status: DocumentStatus.FAILED,
        errorMessage: "The document was rejected by the malware scanner."
      }
    });
    expect(enqueueDocumentIngestion).not.toHaveBeenCalled();
  });
});
