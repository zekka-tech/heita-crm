-- Enable tenant row-level security on business-scoped tables.
-- The app sets app.current_business_id transaction-locally via withBusinessScope().
-- FORCE RLS keeps the app table owner constrained; roles with BYPASSRLS remain exempt.

ALTER TABLE "Business" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Business" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Business_business_scope" ON "Business";
CREATE POLICY "Business_business_scope" ON "Business"
  FOR ALL
  USING ("id" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("id" = current_setting('app.current_business_id', true)::text);

-- Public business surfaces and pre-scope resolvers may locate active businesses
-- by public identifiers such as slug. They must still select only public fields.
DROP POLICY IF EXISTS "Business_public_active_read" ON "Business";
CREATE POLICY "Business_public_active_read" ON "Business"
  FOR SELECT
  USING ("deletedAt" IS NULL AND "isActive" = true);

ALTER TABLE "FeatureFlagOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureFlagOverride" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FeatureFlagOverride_business_scope" ON "FeatureFlagOverride";
CREATE POLICY "FeatureFlagOverride_business_scope" ON "FeatureFlagOverride"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "BusinessInboundAddress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessInboundAddress" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "BusinessInboundAddress_business_scope" ON "BusinessInboundAddress";
CREATE POLICY "BusinessInboundAddress_business_scope" ON "BusinessInboundAddress"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "QrCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QrCode" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "QrCode_business_scope" ON "QrCode";
CREATE POLICY "QrCode_business_scope" ON "QrCode"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "JoinLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JoinLink" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "JoinLink_business_scope" ON "JoinLink";
CREATE POLICY "JoinLink_business_scope" ON "JoinLink"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Membership_business_scope" ON "Membership";
CREATE POLICY "Membership_business_scope" ON "Membership"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "StaffMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffMember" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "StaffMember_business_scope" ON "StaffMember";
CREATE POLICY "StaffMember_business_scope" ON "StaffMember"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "StaffInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffInvite" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "StaffInvite_business_scope" ON "StaffInvite";
CREATE POLICY "StaffInvite_business_scope" ON "StaffInvite"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "AiWorkspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiWorkspace" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AiWorkspace_business_scope" ON "AiWorkspace";
CREATE POLICY "AiWorkspace_business_scope" ON "AiWorkspace"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "AiProviderConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiProviderConnection" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AiProviderConnection_business_scope" ON "AiProviderConnection";
CREATE POLICY "AiProviderConnection_business_scope" ON "AiProviderConnection"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "BusinessDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessDocument" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "BusinessDocument_business_scope" ON "BusinessDocument";
CREATE POLICY "BusinessDocument_business_scope" ON "BusinessDocument"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "WebSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebSource" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "WebSource_business_scope" ON "WebSource";
CREATE POLICY "WebSource_business_scope" ON "WebSource"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "DocumentChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentChunk" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "DocumentChunk_business_scope" ON "DocumentChunk";
CREATE POLICY "DocumentChunk_business_scope" ON "DocumentChunk"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "AiChatSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiChatSession" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AiChatSession_business_scope" ON "AiChatSession";
CREATE POLICY "AiChatSession_business_scope" ON "AiChatSession"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "LoyaltyTier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyTier" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "LoyaltyTier_business_scope" ON "LoyaltyTier";
CREATE POLICY "LoyaltyTier_business_scope" ON "LoyaltyTier"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "Reward" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reward" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Reward_business_scope" ON "Reward";
CREATE POLICY "Reward_business_scope" ON "Reward"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "Promotion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Promotion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Promotion_business_scope" ON "Promotion";
CREATE POLICY "Promotion_business_scope" ON "Promotion"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "PromotionRedemption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromotionRedemption" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PromotionRedemption_business_scope" ON "PromotionRedemption";
CREATE POLICY "PromotionRedemption_business_scope" ON "PromotionRedemption"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Event_business_scope" ON "Event";
CREATE POLICY "Event_business_scope" ON "Event"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Message_business_scope" ON "Message";
CREATE POLICY "Message_business_scope" ON "Message"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "LoyaltyTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyTransaction" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "LoyaltyTransaction_business_scope" ON "LoyaltyTransaction";
CREATE POLICY "LoyaltyTransaction_business_scope" ON "LoyaltyTransaction"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "PipelineStage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineStage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PipelineStage_business_scope" ON "PipelineStage";
CREATE POLICY "PipelineStage_business_scope" ON "PipelineStage"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "SalesThread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalesThread" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SalesThread_business_scope" ON "SalesThread";
CREATE POLICY "SalesThread_business_scope" ON "SalesThread"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "OutboundDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboundDocument" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "OutboundDocument_business_scope" ON "OutboundDocument";
CREATE POLICY "OutboundDocument_business_scope" ON "OutboundDocument"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "FollowUpTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FollowUpTask" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FollowUpTask_business_scope" ON "FollowUpTask";
CREATE POLICY "FollowUpTask_business_scope" ON "FollowUpTask"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "ReferralCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralCode" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ReferralCode_business_scope" ON "ReferralCode";
CREATE POLICY "ReferralCode_business_scope" ON "ReferralCode"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "CustomerImportRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerImportRun" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CustomerImportRun_business_scope" ON "CustomerImportRun";
CREATE POLICY "CustomerImportRun_business_scope" ON "CustomerImportRun"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "AiTokenUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiTokenUsage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AiTokenUsage_business_scope" ON "AiTokenUsage";
CREATE POLICY "AiTokenUsage_business_scope" ON "AiTokenUsage"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "StaffAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffAuditLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "StaffAuditLog_business_scope" ON "StaffAuditLog";
CREATE POLICY "StaffAuditLog_business_scope" ON "StaffAuditLog"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "CustomerSegment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerSegment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CustomerSegment_business_scope" ON "CustomerSegment";
CREATE POLICY "CustomerSegment_business_scope" ON "CustomerSegment"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "OcrReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OcrReceipt" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "OcrReceipt_business_scope" ON "OcrReceipt";
CREATE POLICY "OcrReceipt_business_scope" ON "OcrReceipt"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "BusinessSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessSubscription" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "BusinessSubscription_business_scope" ON "BusinessSubscription";
CREATE POLICY "BusinessSubscription_business_scope" ON "BusinessSubscription"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "BusinessInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessInvoice" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "BusinessInvoice_business_scope" ON "BusinessInvoice";
CREATE POLICY "BusinessInvoice_business_scope" ON "BusinessInvoice"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);
