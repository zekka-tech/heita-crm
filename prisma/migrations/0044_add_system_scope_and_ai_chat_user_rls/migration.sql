-- Allow explicitly authorized cross-tenant admin/reporting jobs to run under the app role.
-- The app sets app.system_scope transaction-locally via withSystemScope().

DO $$
DECLARE
  table_name text;
  tables text[] := ARRAY[
    'Business',
    'FeatureFlagOverride',
    'BusinessInboundAddress',
    'QrCode',
    'JoinLink',
    'Membership',
    'StaffMember',
    'StaffInvite',
    'AiWorkspace',
    'AiProviderConnection',
    'BusinessDocument',
    'WebSource',
    'DocumentChunk',
    'AiChatSession',
    'LoyaltyTier',
    'Reward',
    'Promotion',
    'PromotionRedemption',
    'Event',
    'Message',
    'LoyaltyTransaction',
    'PipelineStage',
    'SalesThread',
    'OutboundDocument',
    'FollowUpTask',
    'ReferralCode',
    'CustomerImportRun',
    'AiTokenUsage',
    'StaffAuditLog',
    'CustomerSegment',
    'OcrReceipt',
    'BusinessSubscription',
    'BusinessInvoice',
    'Conversation',
    'ConversationParticipant'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_system_scope', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (current_setting(''app.system_scope'', true) = ''on'') WITH CHECK (current_setting(''app.system_scope'', true) = ''on'')',
      table_name || '_system_scope',
      table_name
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "AiChatSession_user_read" ON "AiChatSession";
CREATE POLICY "AiChatSession_user_read" ON "AiChatSession"
  FOR SELECT
  USING ("userId" = current_setting('app.current_user_id', true)::text);
