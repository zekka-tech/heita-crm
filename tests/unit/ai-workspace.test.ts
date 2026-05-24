import { DocumentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  aiWorkspace: {
    findUnique: vi.fn()
  },
  businessDocument: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  }
};

const enqueueDocumentIngestion = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma
}));

vi.mock("@/lib/ai/document-processor", () => ({
  enqueueDocumentIngestion
}));

const {
  createDocumentRecord,
  requestDocumentIngestion
} = await import("@/server/services/ai-workspace.service");

describe("ai workspace service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      status: DocumentStatus.PROCESSING
    });

    const result = await requestDocumentIngestion("document_123");

    expect(result).toEqual({
      status: "processing",
      documentId: "document_123",
      ingestion: null
    });
    expect(enqueueDocumentIngestion).not.toHaveBeenCalled();
  });

  it("clears failed status before retrying document ingestion", async () => {
    prisma.businessDocument.findUnique.mockResolvedValue({
      id: "document_123",
      status: DocumentStatus.FAILED
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
});
