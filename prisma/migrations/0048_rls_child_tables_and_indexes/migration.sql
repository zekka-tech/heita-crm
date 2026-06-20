-- Migration 0048: RLS for child tables (AiChatMessage, MessageAttachment) + missing indexes
--
-- AiChatMessage and MessageAttachment have no businessId column; they inherit
-- tenant scope through their parent (AiChatSession / Message respectively).
-- Without explicit RLS, a direct SELECT on these tables by the heita_app role
-- returns all rows regardless of tenant, bypassing the parent-level policy.
--
-- We also add missing performance indexes surfaced during the audit:
--   - Session(userId)      — for session invalidation / user-deletion sweeps
--   - OcrReceipt(membershipId) — for per-membership receipt history queries
--   - SalesThread(businessId, status, nextFollowUpAt) — for cron follow-up queries

-- ── AiChatMessage RLS ──────────────────────────────────────────────────────

ALTER TABLE "AiChatMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiChatMessage" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "AiChatMessage_business_scope" ON "AiChatMessage";
CREATE POLICY "AiChatMessage_business_scope" ON "AiChatMessage"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "AiChatSession" s
      WHERE s.id = "AiChatMessage"."sessionId"
        AND s."businessId" = current_setting('app.current_business_id', true)::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "AiChatSession" s
      WHERE s.id = "AiChatMessage"."sessionId"
        AND s."businessId" = current_setting('app.current_business_id', true)::text
    )
  );

DROP POLICY IF EXISTS "AiChatMessage_system_scope" ON "AiChatMessage";
CREATE POLICY "AiChatMessage_system_scope" ON "AiChatMessage"
  FOR ALL
  USING (current_setting('app.system_scope', true) = 'on')
  WITH CHECK (current_setting('app.system_scope', true) = 'on');

-- ── MessageAttachment RLS ──────────────────────────────────────────────────

ALTER TABLE "MessageAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageAttachment" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "MessageAttachment_business_scope" ON "MessageAttachment";
CREATE POLICY "MessageAttachment_business_scope" ON "MessageAttachment"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Message" m
      WHERE m.id = "MessageAttachment"."messageId"
        AND m."businessId" = current_setting('app.current_business_id', true)::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Message" m
      WHERE m.id = "MessageAttachment"."messageId"
        AND m."businessId" = current_setting('app.current_business_id', true)::text
    )
  );

DROP POLICY IF EXISTS "MessageAttachment_system_scope" ON "MessageAttachment";
CREATE POLICY "MessageAttachment_system_scope" ON "MessageAttachment"
  FOR ALL
  USING (current_setting('app.system_scope', true) = 'on')
  WITH CHECK (current_setting('app.system_scope', true) = 'on');

-- ── Notification RLS (user-scoped) ────────────────────────────────────────
--
-- Notifications are per-user (no businessId). Without RLS, the heita_app role
-- can read every user's notification inbox. We restrict SELECTs to the current
-- user and allow writes only under system scope (used by notification.service).

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notification_user_read" ON "Notification";
CREATE POLICY "Notification_user_read" ON "Notification"
  FOR SELECT
  USING ("userId" = current_setting('app.current_user_id', true)::text);

-- Business-scoped flows (joining a business, referral/tier rewards) create
-- notifications for users who are members of the current business. We allow the
-- INSERT but deliberately grant no SELECT here — a member's inbox (which may hold
-- notifications from other businesses) must never be readable under business
-- scope. Writers therefore use createMany (no RETURNING) so no SELECT policy is
-- exercised on the inserted rows.
DROP POLICY IF EXISTS "Notification_business_insert" ON "Notification";
CREATE POLICY "Notification_business_insert" ON "Notification"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."userId" = "Notification"."userId"
        AND m."businessId" = current_setting('app.current_business_id', true)::text
    )
  );

DROP POLICY IF EXISTS "Notification_system_scope" ON "Notification";
CREATE POLICY "Notification_system_scope" ON "Notification"
  FOR ALL
  USING (current_setting('app.system_scope', true) = 'on')
  WITH CHECK (current_setting('app.system_scope', true) = 'on');

-- ── Performance indexes ────────────────────────────────────────────────────

-- Session(userId): required for session invalidation on user deletion.
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

-- OcrReceipt(membershipId): per-membership receipt history.
CREATE INDEX IF NOT EXISTS "OcrReceipt_membershipId_idx" ON "OcrReceipt"("membershipId");

-- SalesThread(businessId, status, nextFollowUpAt): cron follow-up sweep.
CREATE INDEX IF NOT EXISTS "SalesThread_businessId_status_nextFollowUpAt_idx"
  ON "SalesThread"("businessId", "status", "nextFollowUpAt");
