-- Allow customer/staff self-service reads under the app runtime role.
-- Business-scoped writes still require app.current_business_id via withBusinessScope().
-- These SELECT-only policies are OR-combined with the existing business-scope policies.

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Membership_user_self_read" ON "Membership";
CREATE POLICY "Membership_user_self_read" ON "Membership"
  FOR SELECT
  USING ("userId" = current_setting('app.current_user_id', true)::text);

ALTER TABLE "StaffMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffMember" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "StaffMember_user_self_read" ON "StaffMember";
CREATE POLICY "StaffMember_user_self_read" ON "StaffMember"
  FOR SELECT
  USING ("userId" = current_setting('app.current_user_id', true)::text);

ALTER TABLE "LoyaltyTier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyTier" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "LoyaltyTier_user_membership_read" ON "LoyaltyTier";
CREATE POLICY "LoyaltyTier_user_membership_read" ON "LoyaltyTier"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "Membership" m
      WHERE m."businessId" = "LoyaltyTier"."businessId"
        AND m."userId" = current_setting('app.current_user_id', true)::text
        AND m."isActive" = true
    )
  );

ALTER TABLE "LoyaltyTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyTransaction" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "LoyaltyTransaction_user_membership_read" ON "LoyaltyTransaction";
CREATE POLICY "LoyaltyTransaction_user_membership_read" ON "LoyaltyTransaction"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "Membership" m
      WHERE m."id" = "LoyaltyTransaction"."membershipId"
        AND m."businessId" = "LoyaltyTransaction"."businessId"
        AND m."userId" = current_setting('app.current_user_id', true)::text
        AND m."isActive" = true
    )
  );

ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Conversation_user_self_read" ON "Conversation";
CREATE POLICY "Conversation_user_self_read" ON "Conversation"
  FOR SELECT
  USING (
    "customerId" = current_setting('app.current_user_id', true)::text
    OR EXISTS (
      SELECT 1
      FROM "ConversationParticipant" cp
      WHERE cp."conversationId" = "Conversation"."id"
        AND cp."userId" = current_setting('app.current_user_id', true)::text
    )
  );

ALTER TABLE "ConversationParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConversationParticipant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ConversationParticipant_user_self_read" ON "ConversationParticipant";
CREATE POLICY "ConversationParticipant_user_self_read" ON "ConversationParticipant"
  FOR SELECT
  USING (
    "userId" = current_setting('app.current_user_id', true)::text
    OR EXISTS (
      SELECT 1
      FROM "Conversation" c
      WHERE c."id" = "ConversationParticipant"."conversationId"
        AND c."customerId" = current_setting('app.current_user_id', true)::text
    )
  );

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Message_user_conversation_read" ON "Message";
CREATE POLICY "Message_user_conversation_read" ON "Message"
  FOR SELECT
  USING (
    "userId" = current_setting('app.current_user_id', true)::text
    OR EXISTS (
      SELECT 1
      FROM "Conversation" c
      WHERE c."id" = "Message"."conversationId"
        AND c."customerId" = current_setting('app.current_user_id', true)::text
    )
  );
