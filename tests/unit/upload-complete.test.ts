import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf", () => ({
  csrfFailureResponse: vi.fn().mockResolvedValue(null)
}));

vi.mock("@/lib/request-auth", () => ({
  authenticateRequestUser: vi.fn().mockResolvedValue({ userId: "usr_1" })
}));

vi.mock("@/lib/staff", () => ({
  requireRole: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/lib/metrics", () => ({
  observeHttpRoute: vi.fn()
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 5, resetInSeconds: 60 }),
  rateLimitHeaders: () => ({})
}));

const mockDoc = {
  id: "doc_1",
  businessId: "biz_1",
  status: "PENDING",
  storageKey: "businesses/biz_1/documents/test.pdf",
  fileName: "test.pdf"
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    businessDocument: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue(mockDoc)
    }
  }
}));

vi.mock("@/server/services/ai-workspace.service", () => ({
  requestDocumentIngestion: vi.fn().mockResolvedValue({
    status: "processing",
    documentId: "doc_1",
    ingestion: null
  }),
  isAiWorkspaceServiceError: (e: unknown) =>
    e instanceof Error && "status" in e
}));

const { handleCompleteUpload } = await import("@/server/http/upload-handler");

function makeRequest() {
  return new Request("http://localhost/api/upload/doc_1/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-heita-csrf": "token",
      cookie: "__Host-heita-csrf=token",
      authorization: "Bearer session_token"
    }
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  const { prisma } = await import("@/lib/prisma");
  vi.mocked(prisma.businessDocument.findUnique).mockResolvedValue(mockDoc as never);
  const { requestDocumentIngestion } = await import("@/server/services/ai-workspace.service");
  vi.mocked(requestDocumentIngestion).mockResolvedValue({
    status: "processing",
    documentId: "doc_1",
    ingestion: null
  });
  const { authenticateRequestUser } = await import("@/lib/request-auth");
  vi.mocked(authenticateRequestUser).mockResolvedValue({ userId: "usr_1" } as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("handleCompleteUpload", () => {
  it("enqueues ingestion and returns 202 for a pending document", async () => {
    const res = await handleCompleteUpload(makeRequest(), "doc_1");
    expect(res.status).toBe(202);
    const { requestDocumentIngestion } = await import("@/server/services/ai-workspace.service");
    expect(requestDocumentIngestion).toHaveBeenCalledOnce();
    expect(requestDocumentIngestion).toHaveBeenCalledWith("doc_1", "usr_1");
  });

  it("returns 404 when document does not exist", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.businessDocument.findUnique).mockResolvedValueOnce(null);

    const res = await handleCompleteUpload(makeRequest(), "doc_missing");
    expect(res.status).toBe(404);
    const { requestDocumentIngestion } = await import("@/server/services/ai-workspace.service");
    expect(requestDocumentIngestion).not.toHaveBeenCalled();
  });

  it("returns 200 for a document already in READY state", async () => {
    const { requestDocumentIngestion } = await import("@/server/services/ai-workspace.service");
    vi.mocked(requestDocumentIngestion).mockResolvedValueOnce({
      status: "ready" as const,
      documentId: "doc_1",
      ingestion: null
    });

    const res = await handleCompleteUpload(makeRequest(), "doc_1");
    expect(res.status).toBe(200);
  });

  it("returns 401 when not authenticated", async () => {
    const { authenticateRequestUser } = await import("@/lib/request-auth");
    vi.mocked(authenticateRequestUser).mockResolvedValueOnce(null);

    const res = await handleCompleteUpload(makeRequest(), "doc_1");
    expect(res.status).toBe(401);
  });
});
