-- B4: Add cache-specific token columns to AiTokenUsage for Anthropic
-- prompt-caching cost observability. Cache reads cost ~10% of input tokens;
-- cache creation costs ~125% of input tokens. Tracking them separately allows
-- accurate cost attribution per message.
ALTER TABLE "AiTokenUsage"
  ADD COLUMN IF NOT EXISTS "cacheReadTokens"     INTEGER,
  ADD COLUMN IF NOT EXISTS "cacheCreationTokens" INTEGER;
