import { afterEach, describe, expect, it, vi } from "vitest";

// The vector-store queries are the cross-tenant guard; test them directly.

const queryRawMock = vi.fn();

const withBusinessScopeMock = vi.fn(async (_businessId: string, fn: (tx: { $queryRaw: typeof queryRawMock }) => unknown) =>
  fn({ $queryRaw: queryRawMock })
);

vi.mock("@/lib/prisma", () => ({
  withBusinessScope: withBusinessScopeMock
}));

// Prisma.sql tagged template produces a TemplateStringsArray-based object
vi.mock("@prisma/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@prisma/client")>();
  return {
    ...actual,
    Prisma: {
      ...actual.Prisma,
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
      join: (items: unknown[]) => items,
      raw: (s: string) => s
    }
  };
});

// Redis is not needed in unit tests; mock it away so the embedding cache
// has no effect on the vector-store isolation tests.
vi.mock("@/lib/redis", () => ({
  getRedis: () => null
}));

const { findSimilarDocumentChunks, findChunksByFts } = await import("@/lib/ai/vector-store");

afterEach(() => {
  vi.clearAllMocks();
});

describe("findSimilarDocumentChunks — businessId isolation", () => {
  it("passes the requesting businessId into the SQL query", async () => {
    queryRawMock.mockResolvedValue([]);

    await findSimilarDocumentChunks({
      businessId: "biz_target",
      queryEmbedding: Array.from({ length: 1024 }, () => 0)
    });

    expect(queryRawMock).toHaveBeenCalledOnce();
    const [sqlObj] = queryRawMock.mock.calls[0] as [{ values: unknown[] }];
    const flatValues = sqlObj.values.flat(Infinity);
    expect(flatValues).toContain("biz_target");
  });

  it("does NOT surface documents from a different business", async () => {
    queryRawMock.mockResolvedValue([
      {
        id: "chunk_1",
        documentId: "doc_other",
        documentTitle: "Other biz doc",
        chunkIndex: 0,
        content: "Secret data",
        metadata: null,
        similarity: 0.99
      }
    ]);

    const results = await findSimilarDocumentChunks({
      businessId: "biz_requester",
      queryEmbedding: Array.from({ length: 1024 }, () => 0)
    });

    expect(queryRawMock).toHaveBeenCalledOnce();
    const [sqlObj] = queryRawMock.mock.calls[0] as [{ values: unknown[] }];
    const flatValues = sqlObj.values.flat(Infinity);
    expect(flatValues).toContain("biz_requester");
    expect(flatValues).not.toContain("biz_other");
    // Similarity 0.99 clears the 0.25 threshold — row is returned.
    expect(results).toHaveLength(1);
  });

  it("filters out results below the similarity threshold", async () => {
    queryRawMock.mockResolvedValue([
      { id: "a", documentId: "d1", documentTitle: "T1", chunkIndex: 0, content: "x", metadata: null, similarity: 0.8 },
      { id: "b", documentId: "d2", documentTitle: "T2", chunkIndex: 0, content: "y", metadata: null, similarity: 0.1 }
    ]);

    const results = await findSimilarDocumentChunks({
      businessId: "biz_1",
      queryEmbedding: Array.from({ length: 1024 }, () => 0),
      threshold: 0.25
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("a");
  });

  it("returns empty when all results are below threshold", async () => {
    queryRawMock.mockResolvedValue([
      { id: "a", documentId: "d1", documentTitle: "T1", chunkIndex: 0, content: "x", metadata: null, similarity: 0.05 }
    ]);

    const results = await findSimilarDocumentChunks({
      businessId: "biz_1",
      queryEmbedding: Array.from({ length: 1024 }, () => 0)
    });

    expect(results).toHaveLength(0);
  });
});

describe("findChunksByFts — businessId isolation", () => {
  it("passes the requesting businessId into the FTS query", async () => {
    queryRawMock.mockResolvedValue([]);

    await findChunksByFts({ businessId: "biz_fts", queryText: "coffee" });

    expect(queryRawMock).toHaveBeenCalledOnce();
    const [sqlObj] = queryRawMock.mock.calls[0] as [{ values: unknown[] }];
    const flatValues = sqlObj.values.flat(Infinity);
    expect(flatValues).toContain("biz_fts");
    expect(flatValues).toContain("coffee");
  });

  it("returns empty array for blank query without hitting DB", async () => {
    const results = await findChunksByFts({ businessId: "biz_1", queryText: "   " });
    expect(results).toHaveLength(0);
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
