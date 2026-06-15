# Heita CRM — Technical Due Diligence

**Prepared for:** Investor technical diligence
**Subject:** Heita CRM — multi-tenant PWA loyalty + WhatsApp messaging + per-tenant RAG AI co-worker
**Stack:** Next.js 15 (App Router) · TypeScript · Prisma 7 · PostgreSQL 16 + pgvector · Auth.js v5 · BullMQ/Redis
**Method:** Evidence-based review of source, migrations, tests, CI, and infra. Claims verified against code; file/line citations provided.
**Date:** 2026-06-14

---

## 0. Headline metrics (measured, not claimed)

| Metric | Value | Source |
|---|---|---|
| Source files (`.ts`/`.tsx` under `src`) | 425 | `find src` |
| Source LOC | ~53,100 | `wc -l` |
| Prisma models | 46 | `prisma/schema.prisma` |
| Prisma migrations | 42 (`0001`–`0042`) | `prisma/migrations` |
| Domain services | ~40 | `src/server/services` |
| Unit/integration test files | 88 | `find ... *.test.ts` |
| `it/test` cases | ~670 | grep |
| E2E specs (Playwright) | 11 | `tests/e2e` |
| BYOM provider models in registry | 19 references | `src/lib/ai/providers/registry.ts` |
| `TODO/FIXME/HACK` markers in `src` | 1 | grep |
| `any` / `@ts-ignore` / `@ts-expect-error` in `src` | 3 | grep |
| Production npm vulnerabilities | 0 | `npm audit --omit=dev` |
| Prometheus metrics defined | 29 | `src/lib/metrics.ts` |
| Git commits | 185 | `git log` |

This is a substantial, disciplined codebase. The near-total absence of `any`, `@ts-ignore`, and TODOs across 53k LOC is unusual and indicates real engineering rigor, not a prototype.

---

## 1. Architecture & code quality — **Strong (8/10)**

**Layering is clean and enforced.** Data access is centralized in `src/server/services/*.service.ts`. The convention "UI never touches Prisma directly outside read-only Server Components" is largely honored. Services expose typed inputs/outputs, throw typed error classes (e.g. `AiProviderServiceError` with `status`/`code`, `AiUsageQuotaExceededError`), and wrap multi-step writes in `prisma.$transaction` with explicit `maxWait`/`timeout` (e.g. `ai-provider.service.ts:213`, `:319`, `:357`).

**Type safety is excellent.** `tsconfig` strict, 124 zod/validation references in `src/lib/env.ts` for env validation, only 3 type escapes in the entire `src` tree.

**RAG/AI design is genuinely sophisticated** (see §4). The App Router structure follows the documented map; route groups `(auth)`, `(app)`, `b/[slug]`, `dashboard/[businessId]` match reality.

**Weaknesses:**
- Some services are large (`loyalty.service.ts` ~27k chars / `whatsapp.service.ts` ~20k chars) — candidates for decomposition.
- The biggest structural inconsistency is the **uneven application of the tenant-scope pattern** (see §2), which is both an architecture and a correctness concern.

---

## 2. Multi-tenant isolation — **Configured, partially verified, still incomplete at app scale (6.5/10)**

This is the single most important finding for an investor whose thesis depends on multi-tenant SaaS.

### What exists and is good
- **`src/lib/prisma.ts`** implements `withBusinessScope(businessId, fn)` (`:134`), which opens a transaction and sets `app.current_business_id` transaction-locally via `set_config(..., true)` (`:145`) before running tenant work.
- **Migration `0040_enable_business_rls`** (274 lines) enables `ENABLE ROW LEVEL SECURITY` **and** `FORCE ROW LEVEL SECURITY` on `Business` + ~33 tenant tables, with `USING`/`WITH CHECK` policies keyed to `current_setting('app.current_business_id', true)::text`.
- **`docker/postgres/init.sql`** establishes a genuine two-role model: owner `heita` (superuser, migrations only) and `heita_app` (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`) for the app runtime. `.env.production.example:28` confirms the app `DATABASE_URL` uses `heita_app`, and `docker-compose.prod.yml:127` confirms migrations use a separate `MIGRATION_DATABASE_URL`. **This is correct defense-in-depth design.**

### The gap (HIGH severity)

**1. RLS is no longer purely simulated, but coverage is still narrow.** The older "RLS" test suites are still mostly **in-memory simulators**, not full app-role execution:
- `tests/unit/multi-tenant-property.test.ts` — a hand-written `RlsTable` JS class that filters by a JS variable.
- `src/__tests__/rls-isolation.test.ts` — a mock object simulating the policy.
- `src/__tests__/prisma-business-scope.test.ts` — mocks `$transaction`/`$executeRaw` with `vi.fn()`.
- `src/__tests__/rls-migration.test.ts` — only **string-greps the migration SQL** for policy text.

CI still runs most of the suite against the **`heita` owner role**, but it now also provisions **`heita_app`** and runs a live RLS smoke test that proves cross-tenant reads fail closed until `app.current_business_id` is set. That closes the "no live proof at all" gap, but the property tests still prove mainly the *logic* of `withBusinessScope`, not whole-app behavior under the runtime role.

**2. A non-trivial set of services now use `withBusinessScope` following the second sweep.** The initial sweep moved core analytics/AI provider/vector/usage paths onto scoped access. A follow-up sweep has now scoped:
- `staff-invite.service.ts` — fully scoped
- `ai-workspace.service.ts` — fully scoped
- `customer-import.service.ts` — fully scoped
- `inbound-address.service.ts` — fully scoped
- `web-source.service.ts` — already scoped (verified)
- `segment.service.ts` — already scoped (verified)

These join the previously scoped paths: `analytics.service.ts`, `vector-store.ts`, `ai-provider.service.ts`, and `ai-usage.service.ts`.

The remaining unscoped flows are narrower, though the full app is not yet proven green under the `heita_app` runtime role. The residual risk is now "correct architecture with materially advanced but incomplete rollout."

Under FORCE RLS as `heita_app` with no GUC set, `current_setting('app.current_business_id', true)` returns NULL and every policy predicate (`businessId = NULL`) is false → **these queries return 0 rows**. This produces one of two realities, both of which are problems:

- **(a)** If prod truly runs as `heita_app`, these features (BYOM provider list, analytics, AI workspace, vector retrieval, segments) are **silently broken** — they return empty results. The fact that the product appears to function in dev/CI is because dev/CI connect as the superuser, masking the defect.
- **(b)** If prod is in fact running as the owner/superuser (contradicting the documented intent), then **RLS is dormant** and tenant isolation rests *entirely* on hand-written `where: { businessId }` clauses plus the `requireRole()` checks — i.e. it is *not* the defense-in-depth the docs claim.

The truth is determinable only by inspecting the deployed `DATABASE_URL`'s role. Either way, **the RLS layer is not currently a verified, load-bearing control.** This is a documentation-vs-reality gap directly material to the multi-tenant SaaS thesis.

**3. A permissive public-read policy widens `Business` exposure.** `Business_public_active_read` (`0040:16`) is `FOR SELECT USING (deletedAt IS NULL AND isActive = true)`. Because Postgres RLS policies are **OR-combined**, this lets *any* scope read *any* active business row. It is intentional (public `b/[slug]` surfaces) but means `Business` rows are not tenant-isolated for reads — acceptable only if no sensitive columns live on `Business`. Worth a column-level audit.

### Compensating control
`scripts/check-prisma-tenant-scope.sh` is a clever CI static gate that flags ID-only Prisma mutations (`update/delete/upsert`) lacking a `businessId` guard — the classic IDOR pattern — with a 29-entry reviewed allowlist. This is a real, valuable control against write-side IDOR, but it does not substitute for runtime RLS verification.

**Recommendation (must-fix before scaling tenants):** add a CI job that boots Postgres, applies migrations, connects **as `heita_app`**, and asserts (a) cross-tenant reads return zero rows and (b) every service path either runs inside `withBusinessScope` or is proven safe. Then reconcile every business-scoped service to `withBusinessScope`.

---

## 3. Security posture — **Strong (8/10)**

**Real controls, well-implemented:**
- **HMAC webhook verification** (`src/lib/security.ts:23`) — Meta WhatsApp signature compared with `constantTimeEqual` (`:5`, length-checked, timing-safe).
- **SSRF guard** (`assertPublicHttpUrl`, `:198`) is high quality: http(s)-only, rejects embedded credentials, DNS-resolves and rejects **any** resolved IP in loopback/private/link-local/CGNAT/metadata/multicast ranges, handles IPv4-mapped IPv6, and is **re-run on every redirect hop** in the page crawler (`web-crawler.ts:127`, `redirect: "manual"`).
- **Secret encryption** (`src/lib/secret-crypto.ts`) — AES-256-GCM, versioned ciphertext, scrypt KDF, auth-tag verified on decrypt; BYOM keys never leave the service module (only `keyLast4` surfaced).
- **Trusted-proxy IP handling** (`getClientIp`, `:34`) refuses to honor `X-Forwarded-For` unless a configured trusted proxy is present — correct anti-spoofing posture.
- **Strict CSP/HSTS/X-Frame-Options/Permissions-Policy** via `next.config.ts`; pino redaction; OTP HMAC-signed with triple rate-limiting; constant-time cron secret comparison.

**Gaps / nits (low–medium):**
- **DNS-rebinding TOCTOU: RESOLVED.** `fetchWithPinnedIp` now pins the socket to the validated IP returned by `assertPublicHttpUrl`, eliminating the DNS-rebind window. Callers use this wrapper.
- **robots.txt fetch: RESOLVED.** `fetchRobots` now uses `redirect: "manual"` with per-hop SSRF re-validation, consistent with the hardened page fetcher.
- **Static KDF salt** in `secret-crypto.ts` — acceptable given high-entropy input secret, but documents a constraint for key rotation.

---

## 4. AI / RAG pipeline — **Strong, differentiated (8.5/10)**

**This is the most impressive part of the codebase.** The retrieval pipeline (`src/lib/ai/`) is well beyond a naive "embed + top-k":

- **Hybrid retrieval** (`vector-store.ts:175`): pgvector cosine search **and** Postgres full-text (`websearch_to_tsquery`, GIN index from migration 0030) fused via **Reciprocal Rank Fusion** (RRF, K=60, the canonical constant). Over-fetch of 20 candidates, cosine threshold 0.25, final top-K=5.
- **Query rewriting** (`query-rewriter.ts`) — LLM-backed multi-turn rewrite for retrieval.
- **Reranking** (`reranker.ts`) post-fusion.
- **Hallucination guards:** confidence floor producing a `lowConfidencePrefix` when the top chunk is weak (`rag.ts:50`); a system prompt that explicitly forbids inventing hours/pricing/policies (`rag.ts:62`); grounding checks consuming `retrievedChunks`.
- **Model-agnostic BYOM** (`ai-provider.service.ts`, `providers/`): per-tenant encrypted keys, connection probing/validation, an active-connection selector, and a documented fallback chain **BYOK → Ollama (local) → platform Anthropic**, streamed over SSE. Provider base URLs are SSRF-checked (`ai-provider.service.ts:157`).
- **Token/cost controls** (`ai-usage.service.ts`): per-plan monthly message quotas with a **Serializable**-isolation reserve transaction (`:145`) that prevents quota races, plus reserve/finalize/release lifecycle and a non-blocking RAG eval harness in CI.

**Gaps:**
- **Overage billing is not a live revenue path yet.** Production behavior is intentionally a strict hard cap across tiers. `isOverage` and `billAiOverageCharges()` remain partial scaffolding for a future implementation, but the current invoice money model is not cent-accurate enough to market R0.20/message billing as shipped. The documentation gap is resolved by keeping all collateral on hard-cap semantics.
- Embedding dimension is hardcoded 1024 (`vector-store.ts:32`); switching embedding models is a migration event.
- The main raw-SQL analytics/retrieval paths reviewed in this sweep now run inside `withBusinessScope`, but the broader runtime-role rollout still needs completion (see §2).

---

## 5. Test coverage & CI — **Very strong CI gating; coverage broad but with one critical blind spot (7.5/10)**

**CI (`.github/workflows/ci.yml`) is investor-grade.** Jobs: lint, typecheck, unit tests **with coverage enforcement**, a11y (axe/WCAG-AA), build, **migration drift check**, **destructive-migration gate** (requires `migration-approved` label), **tenant-scope static gate**, npm audit (`--omit=dev --audit-level=moderate`, **blocking**), **Trivy** (fail on CRITICAL), **gitleaks**, **CycloneDX SBOM**, Prometheus/Alertmanager config syntax checks, **error-budget release gate**, bundle-size budget, Lighthouse, and a non-blocking RAG eval. Plus separate workflows for backup-verify, deploy-verify, synthetic probes, and game-day. This is a mature pipeline most Series-A companies do not have.

**88 test files / ~670 cases / 11 E2E specs** including a `cross-tenant-isolation.spec.ts` that asserts a manager of Biz A is blocked from Biz B dashboard routes.

**The blind spot:** as detailed in §2, **only a narrow multi-tenant path touches a real RLS-enforced database today.** The new live CI smoke test is meaningful, but the rest of the unit suites are still simulations and the E2E flows still run under the owner-oriented setup. Coverage is *broad* and now no longer purely mocked, but on the one dimension that matters most to this business model it is still narrower than the docs previously claimed.

---

## 6. Scalability & performance — **Good (7.5/10)**

- **Indexing is deliberate:** 42 migrations include dedicated perf passes (0006 ivfflat → 0016 **HNSW**, 0015/0018/0022/0027/0042 composite + analytics indexes, 0030 GIN FTS, 0025 data invariants). HNSW for vector search is the right choice for read latency at scale.
- **Connection pooling** via `withDatabaseConnectionLimit(DATABASE_URL)` + `PrismaPg` adapter (`prisma.ts:6`).
- **Async offload:** BullMQ workers for document ingestion, web crawl, customer import, follow-ups, receipt batch — with **ordered graceful shutdown** (workers drain → DB → Redis, `workers/index.ts`). Built as a separate `dist/worker.mjs` bundle.
- **ISR vs dynamic** is audited and managed (`docs/FORCE_DYNAMIC_AUDIT.md`): 68 `force-dynamic` routes, but they are overwhelmingly authenticated/CSRF/session-dependent (correctly dynamic), with a documented backlog of public surfaces being converted to ISR (`discover`, `b/[slug]`, OG images already done). Redis-backed caching (`data-cache`, `query-cache`).

**Risks at scale:**
- **`withBusinessScope` opens a transaction per scoped call.** A transaction-per-request model holds a pooled connection for the request's DB lifetime; at high concurrency this pressures the pool. With only part of the service layer using it today the load is still moderate, but reconciling the remaining services to it (the §2 fix) will materially increase transaction/connection pressure — capacity-plan accordingly (PgBouncer in transaction mode is complicated by `SET LOCAL` GUCs).
- **N+1 risk** in the larger services (`loyalty`, `whatsapp`) was not exhaustively audited; analytics correctly pushes aggregation into raw SQL.
- Embedding 1024-dim HNSW memory footprint grows with chunk count; monitor `DocumentChunk` cardinality.

---

## 7. Production readiness — **Strong (8/10)**

- **Dockerfile:** multi-stage, Next standalone output, **non-root** (`nextjs:nodejs`), `dumb-init`, `apk upgrade`, `npm prune --omit=dev`, `HEALTHCHECK` against `/api/health/live`. Separate worker bundle copied in.
- **`docker-compose.prod.yml`:** app + pgvector + redis, healthchecks, two-role DB, separate migration DATABASE_URL, ClamAV malware sidecar, internal network. Staging/ephemeral compose variants also present.
- **Observability:** Sentry (server/edge configs), OpenTelemetry SDK + OTLP exporter, pino with redaction, **29 Prometheus metrics**, `prometheus-rules.yml` + `alertmanager.yml` (syntax-checked in CI), Grafana dashboards, PostHog. **Dual health probes** (`/api/health/live`, `/api/health/ready`).
- **SLO/error-budget discipline:** `scripts/check-error-budget.mjs` queries live Prometheus (MWMB burn-rate + 30-day remaining) with a sentinel-file fallback and an audited override path. `docs/SLO.md`, `docs/ONCALL.md`.
- **Runbooks:** 22 runbooks under `docs/runbooks/` (DLQ depth, RLS enforcement, error-budget burn, auth/webhook failure spikes, etc.) — CI even enforces runbook coverage (`check-observability-runbooks.mjs`).
- **Backups:** `init.sql` configures WAL archiving (`wal_level=replica`, `archive_mode=on`, 2GB WAL retention) with `backup.yml`/`backup-verify.yml` workflows.

**Gaps:**
- Placeholder secrets (`HEITA_APP_CHANGE_ME_NOW`, `CHANGE_ME_*`) must be rotated on first boot — a documented but human-dependent step (easy to miss).
- `archive_command` (S3 WAL push) is left to runtime config — verify it's actually set in the deployed environment, or PITR is illusory.

---

## 8. Technical debt, risks & bus factor

- **Bus factor: HIGH.** Git history shows a single author (`Codex`) across 185 commits. Deep, idiosyncratic systems (RLS GUC pattern, RAG fusion, BYOM, error-budget gating) with no evident second maintainer. Knowledge concentration is a real diligence risk.
- **Documentation-vs-reality:** the codebase is heavily documented and the docs are mostly accurate, but they still require discipline around the *verified* status of RLS isolation. After this sweep the gap is substantially smaller: CI has a live RLS smoke test, 10+ services plus self-service reads are now scoped, the public ISR gap is closed, collateral is honest again about AI hard-cap behavior, and SSRF hardening is complete. The remaining doc-vs-reality gap is that the full runtime-role rollout is not yet proven across the whole app.
- **What breaks at 10x/100x:**
  - *10x:* connection-pool pressure once all services adopt `withBusinessScope`; Redis/BullMQ throughput on AI-reply and ingestion queues; pgvector HNSW memory.
  - *100x:* single-Postgres write ceiling (no sharding/read-replica routing in app code beyond WAL replica config); the per-request transaction model; embedding-store growth.
- **Low code-level debt otherwise:** 1 TODO, 3 type escapes, 0 prod CVEs — genuinely clean.

---

## Production-readiness score: **8.0 / 10**

**Justification.** The engineering quality, CI maturity, observability, RAG sophistication, and security controls are well above the typical Series-A bar (individually 8–8.5). The score has improved from 7.8 to 8.0 with the closure of the public ISR gap, SSRF TOCTOU/robots redirect hardening, explicit `withSystemScope` coverage for legitimate cross-tenant jobs, and the second wave of service scoping (6 additional business-scoped services plus self-service user-scoped reads). It is held back by one remaining structural concern: **multi-tenant isolation is configured with correct intent (FORCE RLS + two-role DB), has a live smoke test, and now has broad runtime helper coverage — but it is still not proven across the full app under the runtime role.** Resolve that and credibly verify it, and this codebase is an honest 8.5/9.

---

## Top 5 remaining technical risks (prioritized)

| # | Risk | Severity | Remediation effort | Action |
|---|---|---|---|---|
| 1 | **RLS isolation materially advanced but still incomplete at app scale.** CI has a live `heita_app` smoke test; runtime helpers now cover business-scoped, user-scoped, and explicit system-scoped admin flows (analytics, AI provider, vector, usage, staff-invite, ai-workspace, customer-import, inbound-address, web-source, segment, loyalty expiry jobs, analytics export, WhatsApp status updates, account export/delete). Full app and E2E suite are not yet proven under the runtime role. | **Critical** | Medium (1–2 wks) | Extend the runtime-role test coverage beyond the smoke path, reconcile remaining edge services, and confirm the deployed role. |
| 2 | **Bus factor — single maintainer** across all 185 commits and every deep subsystem. | **High** | Ongoing | Hire/onboard a second senior engineer; pair on RLS, RAG, billing; document tribal knowledge. |
| 3 | **AI overage price exists in plan metadata, but the production app still hard-caps usage.** `isOverage` and `billAiOverageCharges()` are partial scaffolding rather than a verified revenue path. | **Medium** | Medium | Either keep every external artifact on hard-cap semantics or add cent-accurate invoice support before shipping billed overage. |
| 4 | **SSRF hardening complete.** `fetchWithPinnedIp` pins socket to validated IP; `fetchRobots` uses `redirect: "manual"` with per-hop revalidation. | **Low** (reduced) | Done | Already implemented; no further action needed. |
| 5 | **Scale ceiling of per-request transaction model + single Postgres.** Connection-pool pressure once RLS is fully adopted; no read-replica routing in app. | **Medium** | Medium–High | Capacity-test under full `withBusinessScope` adoption; plan PgBouncer (session-mode caveat for `SET LOCAL`) and read-replica routing before 10x. |

---

*Prepared from direct code inspection. Key evidence files: `src/lib/prisma.ts`, `prisma/migrations/0040_enable_business_rls/migration.sql`, `docker/postgres/init.sql`, `src/lib/security.ts`, `src/lib/secret-crypto.ts`, `src/lib/ai/{rag,vector-store}.ts`, `src/server/services/{ai-provider,ai-usage,analytics}.service.ts`, `.github/workflows/ci.yml`, `scripts/check-prisma-tenant-scope.sh`, `Dockerfile`, `docs/FORCE_DYNAMIC_AUDIT.md`.*
