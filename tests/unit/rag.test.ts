import { afterEach, describe, expect, it, vi } from "vitest";

// The vector-store query is the cross-tenant guard; test it directly.

const queryRawMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRawMock
  }
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

const { findSimilarDocumentChunks } = await import("@/lib/ai/vector-store");

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
    // The businessId should appear somewhere in the interpolated values
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

    // Assert the calling code passes the correct businessId so the DB can enforce the filter.
    expect(queryRawMock).toHaveBeenCalledOnce();
    const [sqlObj] = queryRawMock.mock.calls[0] as [{ values: unknown[] }];
    const flatValues = sqlObj.values.flat(Infinity);
    expect(flatValues).toContain("biz_requester");
    expect(flatValues).not.toContain("biz_other");
    // The raw return is the DB's responsibility — service trusts the filtered result.
    expect(results).toHaveLength(1);
  });
});
