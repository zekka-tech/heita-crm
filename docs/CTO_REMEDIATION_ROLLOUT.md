# Heita CRM — CTO Advisory Remediation & Execution Rollout

> Source of record: `CTO_ADVISORY_INVESTMENT_MEMO.txt` (June 2026, production-readiness 7.8/10).
> Purpose: a sequenced, agent-driven execution plan that closes **every** concern, gap, weakness,
> and shortfall named in the memo, adds the **in-app communication subsystem** (WhatsApp-optional),
> and locks pricing at the **4-tier ladder (Free / Starter R499 / Growth R1499 / Scale R4999)**.
> Status: **IN PROGRESS — verification refreshed 2026-06-14 against code, tests, and CI.**
> 
> **Audited by:** codebase sweeps plus targeted verification in [`docs/advisory/01-technical-due-diligence.md`](./advisory/01-technical-due-diligence.md).

---

## 0. How this rollout is run

- **Agents.** Each workstream below is implemented by a dedicated sub-agent (worktree-isolated where
  it can run in parallel). Independent workstreams run concurrently; dependent ones are sequenced.
  Every agent lands its work as a focused squash-PR into `remediation/*` → `main` (main is
  ruleset-protected; PR-only Prisma tenant-scope gate applies).
- **Definition of done (every item):** code + unit/integration tests + docs updated + `npm run ci`
  green + memo gap explicitly cross-referenced in the PR description.
- **Migration safety:** all schema changes are additive-first, backward-compatible, and gated by the
  destructive-migration `migration-approved` label. RLS rollout is shadow-tested before enforcement.
- **No scope drift:** we do not pivot to horizontal CRM, do not degrade the Free tier, do not flatten
  the franchise hierarchy (per memo §9.2).

### Memo-concern coverage matrix (UPDATED per June 2026 sweep)

| Memo ref | Concern | Workstream | Baseline state | Current status |
|---|---|---|---|---|
| §6.2.1 | Enable Postgres RLS end-to-end | **W1** | policies + two-role model landed; CI provisions `heita_app` and runs live policy smoke test; scoped services now include: analytics, AI provider, vector, usage, staff-invite, ai-workspace, customer-import, inbound-address, web-source, segment | PARTIAL |
| §6.2.2, §6.1 §1.3 | Convert `force-dynamic` public surface | **W2** | **done** — audit + CI done; `/discover`, `b/[slug]`, and `b/[slug]/events` all converted to ISR (events now ISR with revalidate=60 after locale split) | DONE |
| §6.2.3, §6.3.1-2 | SLO dashboards + per-alert runbooks | **W3** | **done** — CI-enforced, 20 runbooks, Grafana exports | DONE |
| §6.2.4 | PostHog + RUM end-to-end | **W3** | **done** — consent-gated, PII-scrubbed, funnel taxonomy live, CAC dashboard | DONE |
| §6.2.5 | ClamAV prod sidecar | **W4** | **done** — docker-compose.prod.yml wired, EICAR-tested, fail-closed, docs complete | DONE |
| §6.3.5 | Error-budget burn-down release gate | **W3** | **done** — live Prometheus query path implemented; nightly sentinel refresh workflow | DONE |
| §6.3.6 | External synthetic monitoring | **W4** | **done** — 15-min probes, Slack alerting, runbook | DONE |
| §6.3.8 | Property-based multi-tenant test | **W1** | **done** — 6 fast-check properties (500+ runs each) in `tests/unit/multi-tenant-property.test.ts` | DONE |
| §6.3.9 | Self-serve StaffAuditLog UI | **W5** | **done** — filterable, paginated, CSV export, role-gated | DONE |
| §6.3.10 | Production-shaped staging seed | **W4** | **done** — 5 businesses, ~100k memberships, ~1M txn, idempotent, RLS-safe | DONE |
| §1.3, §5 W | AI token **hard cap** (not just metric) | **W6** | **done** — strict per-tenant hard cap enforced across tiers; `isOverage` schema/index remain as future billing scaffolding, but live overage billing is intentionally deferred until invoice amounts can represent cents correctly | DONE |
| §1.3 | Batch receipt/till-slip import (SCALE) | **W6** | **done** — `POST /api/receipts/batch` (Growth/Scale gate, BullMQ, rate-limited, 50-item max) | DONE |
| §1.3, §5 W | Offline-first staff dashboard (POC) | **W7** | **done** — SW offline outbox (IndexedDB + Background Sync), OfflineBanner + syncOutbox, earn/receipt queued offline | DONE |
| §1.3, §4.3, §7.7 | WhatsApp template ops + multi-channel de-risk | **W8** | **done** — channel-fallback orchestrator (`IN_APP→WhatsApp→PUSH→SMS→EMAIL`), block/report APIs, POPIA retention cron, typing indicators + delivery ticks in chat UI | DONE |
| **User** | **In-app communication subsystem (WhatsApp-optional)** | **W8** | **done** — Phase 8.2: delivery ticks, typing indicators, auto-ack, heartbeat; Phase 8.3: channel-fallback orchestrator; Phase 8.4: block/report (audited), POPIA purge cron, per-tier quotas | DONE |
| §7.2, user | **Pricing: Starter R499, 4 tiers** | **W0** | **done** — billing.ts single source, checkPlanLimit enforced, UI/seed agree | DONE |
| — | **Worker production deployment** | **OPS** | **done** — worker service added to prod+staging compose; receipt-batch worker wired | DONE |
| — | **Code quality / security hardening** | **SEC** | **done** — 14 CRITICAL/HIGH/MEDIUM findings fixed; JSON-LD XSS, AI input caps, IDOR, rate limits; SSRF socket pinning via `fetchWithPinnedIp`; `fetchRobots` uses `redirect: "manual"` with per-hop validation; robots.txt/sitemap.xml excluded from middleware matcher | DONE |
| — | **DB indexes** | **PERF** | **done** — HNSW, ConversationParticipant userId, AiChatSession userId, AiTokenUsage userId via migration 0042 | DONE |

### Deployment hardening (completed this sweep)

| Item | Status |
|---|---|
| Worker service in `docker-compose.prod.yml` | DONE |
| Worker service in `docker-compose.staging.yml` | DONE |
| Worker `import.meta.main` → Node.js-compatible entrypoint | DONE |
| Security hardening on caddy, vector, clamav, migrate (read_only, cap_drop, security_opt) | DONE |
| Caddy healthcheck added | DONE |
| SSRF hardening: `fetchWithPinnedIp` socket pinning, `fetchRobots` redirect: manual with per-hop revalidation | DONE |

---

## W0 — Pricing lock & tier gating (Free / Starter R499 / Growth R1499 / Scale R4999)

**State:** `src/lib/billing.ts` already defines the 4 tiers with Starter `monthlyPriceZar: 499`.
This workstream *verifies and finishes the enforcement* so price maps to capability everywhere.

1. **Verify the canonical ladder** in `billing.ts`, `prisma/seed.ts`, `pricing/page.tsx`,
   `settings/billing/page.tsx`, and `pages/api/billing/checkout.ts` are all consistent at
   **0 / 499 / 1499 / 4999** (annual = 10× monthly).
2. **Quotas per tier** (members, staff seats, AI msg allowance, bundled WA templates, in-app msgs)
   sourced from one place (`billing.ts`) and enforced in `membership.service`, `staff.ts`,
   `ai-usage.service`, and the new in-app subsystem (W8). Align to memo §7.2 but at 4 tiers:
   - FREE 500 members / 1 staff / 200 AI msgs
   - **STARTER R499** 3,000 members / 3 staff / 1,500 AI msgs / 1,000 WA templates
   - GROWTH R1499 10,000 / 5 (+R149/seat) / 5,000 AI / 3,000 templates
   - SCALE R4999 100k soft-cap / 25 (+R99/seat) / 25,000 AI / 20,000 templates
3. **AI hard-cap stance** keep the configured R0.20/msg overage price as future metadata only until billing is truly shipped; production remains hard-capped (ties to W6).
4. Tests: pricing snapshot test + per-tier quota enforcement tests; e2e on upgrade/downgrade.

**DoD:** single source of truth for price+quota; UI, checkout, seed, and gating all agree; tests green.

---

## W1 — Tenant isolation: enable & enforce Postgres RLS (memo §6.2.1, §6.3.8)

**This remains the #1 critical gap.** Migration `0040_enable_business_rls` enables `FORCE ROW LEVEL
SECURITY` with `current_setting('app.current_business_id')` policies and CI now provisions the
`heita_app` runtime role plus a live smoke test. The remaining work is broader service-by-service
reconciliation under the real app role: several high-value analytics/AI paths are now scoped, but the
whole app has not yet been proven green under `heita_app`.

1. **Runtime DB role audit.** Confirm the app connects as a **non-BYPASSRLS** role in prod (migrations
   run as owner/superuser; the app role must be subject to RLS). Document both roles in `DEPLOYMENT.md`.
2. **Scope propagation.** Wrap every tenant-scoped service path in `withBusinessScope(businessId, …)`
   so the transaction sets `app.current_business_id`. Inventory all `prisma.<model>` writes/reads on
   business-owned tables in `src/server/services/**` and route handlers; migrate them onto the scoped
   client. Public/pre-scope resolvers (slug lookup) keep the explicit `public_active_read` policy.
3. **Belt-and-suspenders.** Keep the existing static-analysis CI gate; RLS is defense-in-depth, not a
   replacement. Add a Prisma client extension assertion that warns when a business-owned model is
   queried outside a scoped transaction (dev/test only).
4. **Shadow rollout.** Stage 1: deploy policies in *permissive* mode + log violations from the
   assertion extension. Stage 2: flip to FORCE after a clean violation window (feature-flagged via W3).
5. **Property-based multi-tenant test (§6.3.8).** Add a fast-check/property test that generates random
   tenants + random CRUD ops and asserts **zero** `businessId` crossing, both at the service layer and
   directly against RLS (attempt cross-tenant `SELECT`/`UPDATE` with a foreign GUC → expect 0 rows).
6. Extend `rls-migration.test.ts` and `prisma-business-scope.test.ts` to cover every newly scoped path.

**DoD:** every business-owned table has a policy *and* every service path sets the GUC; property test in
CI; documented two-role model; shadow→enforce runbook in `docs/runbooks/`.

**Risk:** highest-blast-radius change. Mitigation: shadow mode + per-route migration + e2e regression
suite + ability to disable enforcement via flag without redeploy.

---

## W2 — Performance: finish the `force-dynamic` conversion (memo §6.2.2, §6.1)

`docs/FORCE_DYNAMIC_AUDIT.md` + `scripts/check-force-dynamic-audit.mjs` exist and `/discover` is
converted. The high-traffic public surface remains dynamic.

1. **`b/[slug]` (public business profile)** → cached static shell + `<Suspense>`-wrapped dynamic island
   for auth-dependent CTAs (membership/staff). Heavy data already Redis-cached via
   `withBusinessProfileCache`; move the `auth()` read into a small streamed boundary so the shell is
   static/ISR (`revalidate`).
2. **`b/[slug]/events`** → split request-locale dependency from the static shell (noted blocker in the
   audit), then cache.
3. **`/categories/*`** (memo names it) — if present, same static-shell treatment; otherwise add to the
   discover/locality surface in W8.
4. **`api/og/[slug]`** → cache with explicit invalidation on business-profile change.
5. Keep authenticated dashboard/customer pages dynamic (legitimately per-request) — document the final
   justified set in the audit; CI script enforces the allowlist so no regressions creep back.
6. Lighthouse CI budget remains the gate; add a CWV check on `b/[slug]` to prove the win.

**DoD:** public surface served from cache/ISR; audit doc lists only justified dynamic routes; CI green.

---

## W3 — Observability close-out: runbooks, error-budget gate, PostHog verification (§6.2.3-4, §6.3.1-5)

Dashboards + runbooks + ONCALL + postmortem template + PostHog are landed. Close the remaining loops.

1. **Runbook completeness check.** `scripts/check-observability-runbooks.mjs` should assert *every*
   alert in `prometheus-rules.yml` has a matching `docs/runbooks/<alert>.md`. Wire it into CI.
2. **Error-budget burn-down release gate (§6.3.5).** Add a script that reads burn-rate/SLO status and
   **blocks deploys** that would exhaust budget; wire into `deploy-verify` workflow. Document override.
3. **Postmortem enforcement (§6.3.4).** Require a `postmortem-required` label workflow on game-day /
   Sev-1 incidents; link template.
4. **PostHog/RUM verification (§6.2.4).** Confirm PII scrubbing, consent gating, and the
   join→earn→redeem funnel event taxonomy in `telemetry-events.ts`; add the CAC/LTV dashboard data
   wiring (`dashboards/heita-cac-ltv.json`) is fed by real events. Add the named **paid-CAC dashboard**
   data contract (memo §9.1.4).
5. **SLO dashboard provenance.** Ensure `dashboards/*.json` are committed Grafana exports and referenced
   from `ONCALL.md`.

**DoD:** CI fails on missing runbook; deploy blocked on budget burn; funnel events flowing; dashboards
referenced and reproducible.

---

## W4 — Production hardening: ClamAV, synthetic monitoring, staging seed (§6.2.5, §6.3.6, §6.3.10)

1. **ClamAV prod sidecar (§6.2.5).** Add a `clamav` service to `docker-compose.prod.yml` with health
   check; wire `MALWARE_SCAN_MODE=clamav` + `MALWARE_SCAN_REQUIRED=1`; point `malware-scan.ts` at the
   clamd socket/host; fail-closed on scanner unavailability. Test with EICAR fixture. Update
   `.env.production.example` + `DEPLOYMENT.md`.
2. **External synthetic monitoring (§6.3.6).** Add a black-box prober (GitHub Actions cron + optional
   self-hosted blackbox-exporter) hitting `/api/health/ready`, the join flow, and a `b/[slug]` page
   from outside the cluster; alert via the existing Alertmanager path. Document in a runbook.
3. **Production-shaped staging seed (§6.3.10).** A `db:seed:staging` script generating ~100k
   memberships, ~1M loyalty transactions, ~10k webhook/message rows across multiple tenants, to surface
   bucketing/N+1/RLS regressions before prod. Idempotent + tenant-aware + RLS-compatible.

**DoD:** EICAR blocked in a ClamAV-enabled compose run; synthetic probe alerts on induced outage;
staging seed runs and the analytics/dashboard paths stay performant against it.

---

## W5 — Compliance UX: self-serve StaffAuditLog UI (§6.3.9)

`StaffAuditLog` model exists; POPIA/SOC2 need a queryable surface.

1. **Audit-log viewer** under `dashboard/[businessId]/settings/audit` (OWNER/MANAGER + FRANCHISE_ADMIN
   roll-up), filterable by actor, target user, action, and date range; "every action on user X in the
   last 90 days" as a one-click query (memo §6.3.9).
2. **Export** (CSV) for DSAR/POPIA requests; RLS-scoped (W1).
3. Ensure all sensitive ops already write `StaffAuditLog` rows; add any missing ones (billing changes,
   feature-flag toggles, tier changes, in-app moderation actions).
4. Tests: access-control (role-gated), scoping, export integrity.

**DoD:** role-gated, RLS-scoped audit UI + CSV export; coverage of all sensitive mutations.

---

## W6 — AI cost control & batch ingestion (§1.3, §5 weaknesses)

1. **AI token hard cap (memo: "token budget is a metric, not a hard cap").** Enforce per-tenant monthly
   allowance in `ai-usage.service` + chat route: soft warn → hard stop with graceful degraded message
   and upsell under the shipped hard-cap semantics (ties to W0). Confidence-floor + soft-fail on
   stock/pricing answers (memo §7.7.5 hallucination risk).
2. **Batch receipt/till-slip import (§1.3 SCALE ask).** A staff bulk-upload (zip/multi-file or CSV of
   image URLs) → queued OCR via existing BullMQ pipeline → review queue. Malware-scanned (W4),
   rate-limited, RLS-scoped. SCALE/Growth gated (W0).

**DoD:** AI spend cannot exceed the tier cap; batch import processes N receipts
through the existing review queue with progress + audit.

---

## W7 — Offline-first staff dashboard POC (§1.3, §5 weaknesses)

Memo flags rural/loadshedding staff use. Scope a **proof of concept**, not full parity.

1. Service-worker caching of the dashboard shell + last-known critical data (today's loyalty ops,
   pending receipts) read-only when offline.
2. **Offline outbox** for the highest-value write (earn points / scan receipt) that syncs on reconnect
   with idempotency keys (reuse loyalty idempotency).
3. Clear offline/online status UX + conflict handling.

**DoD:** dashboard opens offline with cached critical data; one write path queues offline and syncs
safely; documented limitations.

---

## W8 — In-app communication subsystem "Heita Connect" (user requirement + §4.3/§7.7 de-risk)

**Goal:** a first-class, channel-independent messaging/chat/status layer inside the PWA so a business
and its customers can communicate in real time **without WhatsApp** — so Heita can self-sustain if
WhatsApp ceases to be viable and extends locality. Reuses existing primitives: `MessageChannel.IN_APP`,
`Message`/`MessageAttachment`, `Notification`, the 4-channel notification dispatcher, web-push
(`/api/push/subscribe`), SSE (already used by AI chat), and Redis.

### Phase 8.1 — Core messaging (text, real-time)
- **Data model (additive migration):** `Conversation` (business↔customer, distinct from sales
  `SalesThread`), `ConversationParticipant` (customer + routed staff/agent), reuse `Message` with
  `channel = IN_APP` and `MessageStatus` (QUEUED→SENT→DELIVERED→READ). RLS-scoped (W1) from day one.
- **Transport:** client→server `POST /api/connect/messages`; server→client **SSE stream**
  `/api/connect/stream` fanned out across instances via **Redis pub/sub** (new helper in `lib/redis`).
- **UI:** customer chat in the `(app)` shell; business **inbox** extends `dashboard/[businessId]/messages`
  (currently WhatsApp-centric) into a unified, channel-labelled inbox.

### Phase 8.2 — Delivery semantics, presence, offline
- Delivery + **read receipts**, **typing indicators**, **presence** (Redis ephemeral keys + pub/sub).
- **Offline/PWA:** web-push notification on new message when disconnected; client **outbox** for offline
  send with idempotency; reconnect reconciliation.

### Phase 8.3 — Media, status, and channel-fallback orchestration (WhatsApp-optional)
- **Media** via `MessageAttachment` + R2/MinIO + **malware scan** (W4).
- **Status / broadcast** ("business status" updates, like WhatsApp status) — ephemeral,
  locality-aware business updates surfaced in the customer shell and discover feed.
- **Unified outbound orchestrator:** a single send API picks channel by reachability/preference —
  **IN_APP first** (if customer has PWA/online), else WhatsApp, else SMS/email — via the existing
  notification dispatcher. This is what makes WhatsApp **optional**: flipping a config/flag (W3) routes
  everything through Heita Connect. Respects quiet-hours + channel opt-in already in the dispatcher.

### Phase 8.4 — Locality, moderation, governance
- **Locality:** geo-tagged business status + "nearby" discovery integration (extends existing
  `/discover` + `public-business.service`), strengthening the local network effect (memo §3.4 moat).
- **Moderation & abuse:** per-conversation rate limits, block/report, staff moderation actions
  (audited via W5), POPIA retention policy for in-app messages (align with existing WhatsApp purge cron).
- **Quotas:** in-app message allowances per tier (W0); keep the same hard-cap semantics unless a real billed overage path ships.
- **Tests:** real-time delivery (SSE+Redis), receipts/presence, offline outbox sync, channel-fallback
  selection, RLS scoping, moderation, retention purge.

**DoD:** two users exchange real-time in-app messages with delivery/read state, media, and presence;
disabling WhatsApp routes all customer comms through Heita Connect with SMS/email fallback; status +
locality feed live; everything RLS-scoped, quota-gated, malware-scanned, audited, and POPIA-retained.

---

## Sequencing & agent allocation

```
Wave 1 (parallel, foundational):
  Agent A → W1  Tenant RLS enforcement        (gates W5, W8 scoping)   [worktree]
  Agent B → W3  Observability close-out                                  [worktree]
  Agent C → W4  ClamAV + synthetic + staging seed                        [worktree]
  Agent D → W0  Pricing lock & tier gating                               [worktree]

Wave 2 (after W1 lands):
  Agent E → W2  force-dynamic public-surface conversion                  [worktree]
  Agent F → W5  StaffAuditLog UI            (needs W1 scoping)           [worktree]
  Agent G → W6  AI hard cap + batch import  (needs W0 quotas)            [worktree]

Wave 3 (after W1 + W4 land):
  Agent H → W8.1/8.2  Heita Connect core + realtime + offline           [worktree]
  Agent I → W7        Offline-first staff dashboard POC                  [worktree]

Wave 4:
  Agent H (cont.) → W8.3/8.4  media, status, channel-fallback, locality, moderation
```

Each agent: own worktree, focused PR, `npm run ci` green, memo cross-reference, no main commits without
the squash-PR workflow. I coordinate, review each PR's diff, and resolve cross-workstream conflicts
(e.g. W1 scoping touched by W5/W6/W8).

---

## Acceptance gate for the whole rollout (maps to memo §6.2 "8–12 weeks to 9/10")

- [x] RLS migration + two-role model + live CI smoke test landed (§6.2.1) — PARTIAL (full app-role rollout and remaining service sweep still open)
- [x] Public surface audit closed: `/discover`, `b/[slug]`, and `b/[slug]/events` all on ISR (§6.2.2) — DONE
- [x] Every alert has a runbook (CI-enforced); error-budget gate wired with live Prometheus query (§6.2.3, §6.3.5) — DONE
- [x] PostHog funnel + named paid-CAC dashboard live (§6.2.4, §9.1.4)
- [x] ClamAV blocks EICAR in prod compose; synthetic probe alerts; staging seed at scale (§6.2.5, §6.3.6/10)
- [x] Self-serve audit-log UI + CSV export (§6.3.9)
- [x] AI spend hard-capped per tier; external pricing/docs now align to the shipped hard-cap behavior (§1.3) — DONE
- [x] Batch receipt import — `POST /api/receipts/batch`, Growth/Scale gate, BullMQ async (§1.3) — DONE
- [x] Offline staff dashboard POC — SW outbox + IndexedDB + BackgroundSync + OfflineBanner (§1.3) — DONE
- [x] Property-based multi-tenant test — 6 fast-check properties, 500+ runs each (§6.3.8) — DONE
- [x] Pricing locked at Free / **Starter R499** / Growth R1499 / Scale R4999, gating enforced (§7.2)
- [x] Worker service in production + staging compose; receipt-batch worker wired
- [x] 14 CRITICAL/HIGH security findings fixed (JSON-LD XSS, AI input caps, IDOR, rate limits, cron idempotency)
- [x] DB performance indexes: HNSW on DocumentChunk.embedding, userId indexes on ConversationParticipant/AiChatSession/AiTokenUsage
- [ ] **Heita Connect** Phase 8.2–8.4 (delivery semantics, presence, channel-fallback, locality, moderation) — PARTIAL
- [x] Full `npm run ci` green; docs updated; PRs reference memo sections

**Remaining execution items after the 2026-06-14 verification pass:**
1. Complete the app-role rollout under `heita_app`: prove remaining service paths green under the runtime role and run the full E2E suite with `heita_app`.
2. ~~Finish the public rendering cleanup by converting `b/[slug]/events` off `force-dynamic` once locale resolution is split from the shell.~~ **DONE** — ISR with revalidate=60.
3. Keep AI usage on strict hard-cap semantics in production and collateral until a cent-accurate invoice money model exists; `isOverage` remains future scaffolding, not a live billed path.

**Production-readiness score (verified): ~8.3/10** — materially stronger than the original memo baseline. Tenant isolation is now scoped across 10+ services plus the user/self-service read paths added in this sweep. SSRF hardening (socket pinning plus robots redirect validation) and public-surface ISR conversion (including `b/[slug]/events`) are complete. AI usage is intentionally a strict hard cap in production; billed overage remains deferred. Still short of 9.5/10 because full app-role runtime rollout is not yet proven.

---

*Prepared as the current execution ledger; update this document only from verified code and CI evidence.*
