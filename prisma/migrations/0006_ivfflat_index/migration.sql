-- D-03 ANN index for pgvector similarity search on DocumentChunk.embedding.
-- ivfflat is the most broadly available pgvector index type and matches the
-- cosine distance operator used in src/lib/ai/vector-store.ts. Lists tuned
-- for an expected catalogue size of ~10k–100k chunks per region; revisit
-- (and consider HNSW once pgvector >= 0.7) once tenant adoption exceeds
-- that range.
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_cosine_idx"
  ON "DocumentChunk"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);

-- Trigram index over Business.name to support fuzzy search later (D-05 prep:
-- search results will also filter on deletedAt). pg_trgm is already in 0001.
CREATE INDEX IF NOT EXISTS "Business_name_trgm_idx"
  ON "Business"
  USING gin (name gin_trgm_ops);

-- Partial indexes that mirror the application-level soft-delete predicate so
-- "active customer" / "active business" reads stay fast.
CREATE INDEX IF NOT EXISTS "User_active_idx"
  ON "User" ("id")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Business_active_idx"
  ON "Business" ("id")
  WHERE "deletedAt" IS NULL;
