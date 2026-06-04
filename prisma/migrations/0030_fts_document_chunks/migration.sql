-- B1: Functional GIN index for full-text search over DocumentChunk content.
-- Enables websearch_to_tsquery() queries in the hybrid RAG retrieval pipeline.
-- This is a Prisma-unmanaged index (same pattern as DocumentChunk_embedding_hnsw_idx)
-- because schema.prisma cannot express functional GIN indexes natively.
-- Note: CONCURRENTLY omitted — Prisma 7 wraps migrations in a transaction.
CREATE INDEX IF NOT EXISTS "DocumentChunk_content_fts_idx"
  ON "DocumentChunk"
  USING gin(to_tsvector('english', "content"));
