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

## Class 2 — Server-component nested-include / auth-subquery gaps (found by the gate)

The original inventory grep had two blind spots that hid an entire class of
gaps, surfaced the first time the `e2e-app-role` gate actually ran the app under
`heita_app`:

1. **`--include=*.ts` only** — it never scanned `.tsx` server components, i.e.
   the whole dashboard + public page surface.
2. **It matches `prisma.<scopedModel>.` directly** — it cannot see a scoped model
   accessed as a *nested relation* inside `prisma.business.findFirst({ include: {
   rewards, events, … } })`, nor an authorization subquery like
   `where: { staffMembers: { some: { userId } } }`. The `Business` row is allowed
   by the public-read policy, but the nested/subquery reads are FORCE-RLS-gated
   and return **empty** under the app role → page 404s (auth subquery) or renders
   empty data (nested include).

Fixed (all wrapped in `withBusinessScope(businessId, …)`, except the public
token resolver which uses `withSystemScope`):

| Site | Symptom under `heita_app` | Fix |
|---|---|---|
| `dashboard/[businessId]/loyalty/page.tsx` | `staffMembers: { some }` + nested members/rewards/tiers → 404 (the gate's failing flow) | `withBusinessScope` |
| `dashboard/[businessId]/{analytics,promotions,franchise,events,sales,customers,messages}/page.tsx` | `staffMembers: { some }` auth subquery → 404 | `withBusinessScope` |
| `dashboard/[businessId]/sales/approvals/page.tsx` | auth subquery **+** bare `prisma.followUpTask.findMany` (scoped model) | `withBusinessScope` ×2 |
| `dashboard/[businessId]/settings/integrations/page.tsx` | nested `inboundAddresses` (scoped) → empty | `withBusinessScope` |
| `app/join/[token]/page.tsx` | public QR/JoinLink token read + scan/click increment → 0 rows / `WITH CHECK` | `withSystemScope` (redirect issued outside the scope) |
| `app/b/[slug]/page.tsx`, `app/b/[slug]/events/page.tsx` | public profile/events: nested rewards/promotions/events/tiers → empty | resolve id by slug (public policy), then `withBusinessScope(id)` |

`dashboard/[businessId]/page.tsx`, `b/[slug]/{rewards,join}/page.tsx` were
already correctly scoped. `messages/actions.ts` and the documented service/handler
`business.find*` reads select only `Business` fields (public policy) and are not
gaps. Re-run the inventory with **both** extensions to stay clean:

```bash
grep -rnE "...prisma\.(<MODELS>)\.[a-z]" src/ --include=*.ts --include=*.tsx | ...
```
Nested-include / `{ some }` gaps still won't show in that grep — the `e2e-app-role`
gate is the backstop for those.

**End-to-end proof — enforced.** The `e2e-app-role` CI job
(`.github/workflows/ci.yml`) boots the app under the `heita_app` role (via
`APP_DATABASE_URL` → `playwright.config.ts` `webServer.env`) and runs the smoke
E2E suite, so any missed scope wrapper surfaces as a failing flow. It is a
**required, blocking gate** (no `continue-on-error`), so RLS enforcement cannot
regress — closing production-readiness blocker #1. Run locally with
`npm run test:e2e:app-role` (after `npm run build`; requires the local
`heita_app` role from `npm run test:rls`). The dev `[RLS-WARN]` guard in
`src/lib/prisma.ts` flags any new miss when `NODE_ENV !== 'production'`.
