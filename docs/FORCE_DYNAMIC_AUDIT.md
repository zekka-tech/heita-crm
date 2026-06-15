# Force Dynamic Audit

This file documents every remaining `export const dynamic = "force-dynamic"` in `src/app`. Run `node scripts/check-force-dynamic-audit.mjs` after changing route rendering behavior.

## Converted

- src/app/discover/page.tsx - removed the cookie-backed `auth()` call used only for a personalized back link. The unfiltered list remains cached for five minutes and the page exports `revalidate = 300`.
- src/app/b/[slug]/page.tsx - auth-dependent CTAs (join/rewards button, staff chat link) and membership stats card extracted into `_components/membership-cta.tsx` Server Components wrapped in `<Suspense>` boundaries. The static shell — business name, description, rewards/promotions/events summaries, loyalty tiers, structured data — is now ISR with `revalidate = 60`.
- src/app/api/og/[slug]/route.tsx - OG images are session-independent; replaced `force-dynamic` with `revalidate = 3600` (one-hour ISR per slug).
- src/app/b/[slug]/events/page.tsx - public events listing; replaced `force-dynamic` with `revalidate = 60` (ISR). Dates use a fixed en-ZA locale on the server so the static shell has no request-time cookie/header reads.

## Remaining Dynamic Routes

- `src/app/b/[slug]/join/page.tsx` - session, membership state, CSRF form, referral/channel attribution.
- `src/app/b/[slug]/rewards/page.tsx` - authenticated balance, tier, referral code, CSRF redemption, stock-sensitive reward state.
- `src/app/b/[slug]/history/page.tsx` - authenticated member receipt/history data.
- `src/app/join/[token]/page.tsx` - invite/referral token workflow.
- `src/app/onboard/page.tsx` - authenticated onboarding flow with CSRF-backed server action.
- `src/app/staff/accept/[token]/page.tsx` - staff invite token workflow.
- `src/app/(app)/home/page.tsx` - authenticated customer home.
- `src/app/(app)/wallet/page.tsx` - authenticated wallet and memberships.
- `src/app/(app)/notifications/page.tsx` - authenticated notifications.
- `src/app/(app)/profile/page.tsx` - authenticated profile settings.
- `src/app/(app)/profile/consents/page.tsx` - authenticated consent history and CSRF revoke controls.
- `src/app/(app)/connect/page.tsx` - authenticated customer in-app conversations and business membership lookup.
- `src/app/dashboard/[businessId]/layout.tsx` - authenticated staff shell, navigation, and business access guard.
- `src/app/dashboard/[businessId]/page.tsx` - staff dashboard metrics scoped to authenticated staff membership.
- `src/app/dashboard/[businessId]/analytics/page.tsx` - authenticated business analytics.
- `src/app/dashboard/[businessId]/ai-workspace/page.tsx` - authenticated AI workspace and document state.
- `src/app/dashboard/[businessId]/customers/page.tsx` - authenticated customer/member list.
- `src/app/dashboard/[businessId]/events/page.tsx` - authenticated event management and CSRF actions.
- `src/app/dashboard/[businessId]/franchise/page.tsx` - authenticated franchise hierarchy data.
- `src/app/dashboard/[businessId]/loyalty/page.tsx` - authenticated staff loyalty operations and CSRF actions.
- `src/app/dashboard/[businessId]/messages/page.tsx` - authenticated staff messaging inbox.
- `src/app/dashboard/[businessId]/promotions/page.tsx` - authenticated promotion management and CSRF actions.
- `src/app/dashboard/[businessId]/receipt-review/page.tsx` - authenticated receipt review queue.
- `src/app/dashboard/[businessId]/sales/page.tsx` - authenticated sales pipeline.
- `src/app/dashboard/[businessId]/sales/[threadId]/page.tsx` - authenticated sales thread detail.
- `src/app/dashboard/[businessId]/sales/approvals/page.tsx` - authenticated follow-up approval queue.
- `src/app/dashboard/[businessId]/settings/billing/page.tsx` - authenticated billing and provider availability.
- `src/app/dashboard/[businessId]/settings/audit/page.tsx` - authenticated staff audit log viewer with scoped filters.
- `src/app/dashboard/[businessId]/settings/audit/export/route.ts` - authenticated staff audit CSV export.
- `src/app/dashboard/[businessId]/settings/feature-flags/page.tsx` - authenticated feature flag management.
- `src/app/dashboard/[businessId]/settings/staff/page.tsx` - authenticated staff/invite management.
- `src/app/api/account/route.ts` - authenticated account read/write with CSRF.
- `src/app/api/account/consents/[id]/revoke/route.ts` - authenticated consent revoke with CSRF.
- `src/app/api/account/consents/cookie/route.ts` - consent cookie mutation.
- `src/app/api/account/export/route.ts` - authenticated POPIA export.
- `src/app/api/account/sign-out-all/route.ts` - authenticated session mutation.
- `src/app/api/account/verify-email/route.ts` - tokenized account verification.
- `src/app/api/connect/ack/route.ts` - authenticated Connect delivery/read acknowledgement mutation.
- `src/app/api/connect/block/route.ts` - authenticated mutation with CSRF.
- `src/app/api/connect/messages/route.ts` - authenticated Connect message list/create endpoint.
- `src/app/api/connect/presence/route.ts` - authenticated Connect presence mutation.
- `src/app/api/connect/report/route.ts` - authenticated mutation with CSRF.
- `src/app/api/connect/stream/route.ts` - authenticated Connect SSE stream.
- `src/app/api/discover/businesses/route.ts` - request-specific discover API response.
- `src/app/api/admin/dlq/route.ts` - admin queue state.
- `src/app/api/admin/dlq/[queue]/route.ts` - admin queue detail/actions.
- `src/app/api/ai/chat/route.ts` - SSE streaming AI chat.
- `src/app/api/ai/promotion-suggestions/route.ts` - authenticated AI generation with CSRF.
- `src/app/api/ai/web-sources/route.ts` - authenticated web-source mutation/list.
- `src/app/api/ai/web-sources/[id]/route.ts` - authenticated web-source detail/mutation.
- `src/app/api/ai/web-sources/[id]/refresh/route.ts` - authenticated refresh mutation.
- `src/app/api/auth/request-staff-otp/route.ts` - staff OTP request rate limits and CSRF.
- `src/app/api/auth/verify-staff-otp/route.ts` - staff OTP verification.
- `src/app/api/cron/hard-delete-users/route.ts` - cron-secret protected mutation.
- `src/app/api/cron/purge-connect-messages/route.ts` - cron-secret protected mutation for retention.
- `src/app/api/cron/purge-whatsapp-messages/route.ts` - cron-secret protected retention job.
- `src/app/api/cron/recalculate-tiers/route.ts` - cron-secret protected loyalty mutation.
- `src/app/api/cron/refresh-web-sources/route.ts` - cron-secret protected crawler enqueue.
- `src/app/api/cron/send-expiry-warnings/route.ts` - cron-secret protected messaging job.
- `src/app/api/cron/sweep-follow-ups/route.ts` - cron-secret protected sales follow-up job.
- `src/app/api/geocode/reverse/route.ts` - request-specific geocoding.
- `src/app/api/health/live/route.ts` - liveness probe with no-store response.
- `src/app/api/health/ready/route.ts` - readiness probe over DB/Redis/storage.
- `src/app/api/push/subscribe/route.ts` - authenticated push subscription mutation.
- `src/app/api/sync/offline/route.ts` - authenticated offline outbox replay endpoint.
- `src/app/api/webhooks/payfast/route.ts` - signed payment webhook.
- `src/app/api/webhooks/stripe/route.ts` - signed payment webhook.
- `src/app/api/webhooks/yoco/route.ts` - signed payment webhook.
