-- Performance + observability indexes (§6.3 Series-A diligence, code quality sweep)

-- ConversationParticipant: userId lookup (used by presence, ack, read-receipt queries)
CREATE INDEX IF NOT EXISTS "ConversationParticipant_userId_idx" ON "ConversationParticipant" ("userId");
CREATE INDEX IF NOT EXISTS "ConversationParticipant_conversationId_idx" ON "ConversationParticipant" ("conversationId");

-- AiChatSession: userId lookup (sign-out-all invalidation, per-user history)
CREATE INDEX IF NOT EXISTS "AiChatSession_userId_idx" ON "AiChatSession" ("userId");

-- AiTokenUsage: userId lookup (per-user usage dashboards, account deletion cleanup)
CREATE INDEX IF NOT EXISTS "AiTokenUsage_userId_idx" ON "AiTokenUsage" ("userId");

-- DocumentChunk: pgvector HNSW index for cosine similarity (prevents full-table scan on RAG)
-- m=16 / ef_construction=64 matches existing HNSW indexes in the schema.
-- Listed in migration-drift-allowlist because Prisma cannot manage this index natively.
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
  ON "DocumentChunk"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- AiTokenUsage: isOverage field for overage billing accrual (§1.3 AI hard cap, W6)
ALTER TABLE "AiTokenUsage" ADD COLUMN IF NOT EXISTS "isOverage" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "AiTokenUsage_isOverage_businessId_idx" ON "AiTokenUsage" ("isOverage", "businessId") WHERE "isOverage" = true;
