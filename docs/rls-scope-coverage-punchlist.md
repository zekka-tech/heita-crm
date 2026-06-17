# RLS App-Role Scope Coverage — Punch-List

Tracking doc for production-readiness blocker #1: proving the entire app runs
green under the non-`BYPASSRLS` `heita_app` role. See
[`rls-enforcement.md`](./runbooks/rls-enforcement.md) for the two-role model and the
`withBusinessScope` / `withUserScope` / `withSystemScope` helpers.

## Method

A call site is a gap when it reads/writes a FORCE-RLS model
(`BUSINESS_SCOPED_MODELS` in `src/lib/prisma.ts`) via the bare `prisma`
singleton (or `ctx.prisma`) **outside** a scope helper. Under `heita_app` such a
query silently returns 0 rows (reads) or fails a `WITH CHECK` (writes).

Inventory command (non-test production sites):

```bash
MODELS='business|featureFlagOverride|businessInboundAddress|qrCode|joinLink|membership|staffMember|staffInvite|aiWorkspace|aiProviderConnection|businessDocument|webSource|documentChunk|aiChatSession|loyaltyTier|reward|promotion|promotionRedemption|event|message|loyaltyTransaction|pipelineStage|salesThread|outboundDocument|followUpTask|referralCode|customerImportRun|aiTokenUsage|staffAuditLog|customerSegment|ocrReceipt|businessSubscription|businessInvoice|conversation|conversationParticipant|merchantCreditLedger|messagePack'
grep -rnE "(^|[^._a-zA-Z])prisma\.($MODELS)\.[a-z]" src/ --include=*.ts \
  | grep -vE "ctx\.prisma|__tests__" | grep -v "//"
```

## Legitimate bare-`prisma` reads (NOT gaps)

All bare `prisma.business.find*` / `groupBy` **SELECTs** are covered by the
`Business_public_active_read` policy (`SELECT USING (deletedAt IS NULL AND
isActive = true)`). The runbook explicitly allows "pre-scope resolvers locating
active businesses by public identifiers." These resolve correctly under
`heita_app` and are intentionally left unwrapped: `ai/chat`, `connect/messages`,
`cron/refresh-web-sources`, `cron/sweep-follow-ups`, `email/webhook` (business
lookup), `sign-in/actions` (business.findMany), `dashboard/.../messages/actions`,
`lib/ai/rag`, `lib/query-cache`, `pages/api/sitemap`, `server/http/ai-chat-handler`,
`server/http/pos-transaction-handler`, `server/http/webhook-handlers` (business
lookup), `services/ai-ad`, `services/channel-dispatch`, `services/channel-orchestrator`,
`services/discovery`, `services/public-business`, `services/receipt-history`,
`services/whatsapp`.

> Caveat: `lib/business.ts` slug-uniqueness check (`business.findUnique({ where:
> { slug } })`) only sees active, non-deleted businesses under the public policy,
> so a slug held by an inactive/soft-deleted business won't be detected. Low risk
> (slug collisions only); revisit if it bites.

## Done in this branch (`chore/rls-app-role-scope-coverage`)

Routers (self-reads / cross-tenant spans):
`loyalty.wallet`, `loyalty.referralCode`, `membership.myMemberships`,
`messaging.inbox`, `events.upcoming`, `promotions.active`, `business.listMine`.

Domain services & paths:
- `loyalty.service` — idempotency `replay` reads → `withBusinessScope`
- `events.service` — `sendDueEventReminders` cross-tenant batch reads → `withSystemScope`
- `franchise.service` — cross-tenant rollups → `withSystemScope`
- `referral.service` — `getOrCreateReferralCode` → `withBusinessScope`
- `whatsapp-commerce.service` — reward catalog reads → `withBusinessScope`
- `follow-up.service` — `draftFollowUp` task lookup → `withSystemScope`
- `customer-import.service` — `processCustomerImportRun` lookup → `withSystemScope`
- `staff-invite.service` — revoke/get-by-token/accept lookups → `withSystemScope`
- `lib/ai/follow-up-drafter` — thread + message reads → `withBusinessScope`
- `pages/api/receipts/submit` — membership check → `withBusinessScope`
- `app/(auth)/sign-in/actions` — staff-membership lookup → `withUserScope`

`notifications` router stays on `ctx.prisma`: `Notification` has **no** RLS
policy (absent from migrations 0040/0043/0044 and `BUSINESS_SCOPED_MODELS`).

## Closed (branch `chore/rls-app-role-coverage-verify`)

All eight previously-tracked gaps are now wrapped. The inventory command at the
top of this doc returns **zero** non-test, non-Business-SELECT hits.

| # | Site | Model | Scope applied | Notes |
|---|------|-------|---------------|-------|
| 1 | `app/api/email/webhook/route.ts` `resolveBusinessIdsForInboundEmail` | `businessInboundAddress` | `withSystemScope` | Pre-scope inbound routing |
| 2 | `app/api/email/webhook/route.ts` (no business-id header branch) | `salesThread` | `withSystemScope` | Cross-tenant resolve by thread id; `userThreadWhere` keeps it to the sender |
| 3 | `server/http/webhook-handlers.ts` `findBusinessForInboundSms` | `businessInboundAddress` | `withSystemScope` | WhatsApp/SMS inbound routing |
| 4 | `server/http/qr-handler.ts` | `qrCode` | `withSystemScope` | Public token resolution |
| 5 | `server/http/qr-handler.ts` | `joinLink` | `withSystemScope` | Public token resolution |
| 6 | `pages/api/events/[eventId].ics.ts` | `event` | `withSystemScope` | Public ICS by event id; business active/not-deleted filter retained |
| 7 | `server/services/business.service.ts` `createBusinessWithDefaults` | `business` (+ nested child writes) | `withSystemScope` | **Write** — new id can't be set as the GUC before INSERT; public SELECT policy doesn't cover INSERT |
| 8 | `server/services/referral.service.ts` `resolveReferralCode` | `referralCode` | caller `tx` else `withBusinessScope` | Removed the bare-`prisma` fallback branch |

Additional gap found during this pass (the inventory grep doesn't catch
`prisma.$transaction`):

| # | Site | Model | Scope applied | Notes |
|---|------|-------|---------------|-------|
| 9 | `server/services/business.service.ts` `updateBusinessWhatsApp` | `business` (update) + `staffAuditLog` (insert) | `withBusinessScope` | Was a bare `prisma.$transaction`; both writes carry a `WITH CHECK` on `app.current_business_id` |

**Remaining to fully prove the role:** run the full E2E suite with
`DATABASE_URL` pointing at the `heita_app` role to prove end-to-end enforcement.
The dev `[RLS-WARN]` guard in `src/lib/prisma.ts` flags any new miss when
`NODE_ENV !== 'production'`.
