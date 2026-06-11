# Heita CRM — Analytics, AI & Performance Enhancement Plan

> Status: **delivered (2026-06-11)** — originally proposed 2026-06-04. Owner: engineering.
> Three independent workstreams (A) Analytics, (B) AI, (C) Performance/Loading.
> Each phase is shippable on its own; phases are ordered so earlier ones de-risk later ones.

## Delivery status (verified against `main`, 2026-06-11)

The plan below is retained as the design record. Re-verified against the code on
`main`, effectively all of it has shipped — the "Audit baseline" section is the
*pre-work* state and no longer reflects the codebase.

| Item | Status | Evidence in code |
|---|---|---|
| **A1** DB-side aggregation | ✅ Done | `analytics.service.ts` uses `prisma.$queryRaw` + `date_trunc('week',…)`; dashboard reads `business._count`, not unbounded `memberships`. |
| **A2** Cache correctness | ✅ Done | `analyticsKey()` includes `weeks`; `analyticsKeysForBusiness()` bust wired into earn/redeem/adjust paths in `loyalty.service.ts`. |
| **A3** Real charting + KPIs + CSV | ✅ Done | Recharts via `analytics/charts-loader.tsx` (lazy); KPIs (retention/liability/active-rate/top-rewards) in `analytics.service.ts`; `analytics/export-button.tsx` streams CSV. |
| **A4** Product analytics + RUM | ✅ Done | Consent-gated PostHog (`posthog-provider.tsx` reads `cookie-consent`); `providers/web-vitals.tsx`. |
| **B1** Retrieval quality | ⚠️ Mostly done | Threshold + over-fetch + bge rerank (`reranker.ts`), hybrid vector+FTS fused via RRF (`hybridSearch` in `vector-store.ts`, migration `0030_fts_document_chunks`). **Gap:** multi-turn query rewriting (standalone-question rewrite) not implemented. |
| **B2** Embedding cache | ✅ Done | `getCachedEmbedding()` in `embeddings.ts`. |
| **B3** Anthropic prompt caching | ✅ Done | `cache_control: { type: "ephemeral" }` + beta header in `anthropic.ts`. |
| **B4** Real token accounting | ✅ Done | `ai-usage.service.ts` records `promptTokens` / `cacheReadTokens` from model usage (migration `0031_ai_cache_token_columns`). |
| **B5** RAG eval harness | ✅ Done | `tests/ai/rag-eval/{golden-set,retrieval.eval}.ts`, `vitest.eval.config.ts`, `npm run test:eval`. |
| **B6** Conversation memory | ✅ Done | `ai/summarizer.ts` rolling summary beyond the turn window. |
| **C1** Caching/rendering | ✅ Done | `Suspense` + cached shell on dashboard; `revalidate`/`unstable_cache` across public/dashboard pages. |
| **C2** Code splitting | ✅ Done | `next/dynamic` for chat, charts, OCR card. |
| **C3** Nav prefetch | ✅ Done | `prefetch` tuned on `bottom-nav.tsx` / `dashboard-bottom-nav.tsx`. |
| **C4** Images/assets | ➖ N/A-ish | Imagery is light (2 `next/image` sites); no further audit needed yet. |
| **C5** Perf budgets in CI | ✅ Done | `.lighthouserc.json` asserted in CI (`ci.yml`, `preview.yml`). |

**Remaining follow-ups:** B1 multi-turn query rewriting; revisit C4 if imagery grows.

## Audit baseline (pre-work state — historical)

What existed *before* this plan was implemented (kept for context; superseded by
the Delivery status table above):

**Analytics**
- `analytics.service.ts` computes weekly buckets in JS from three unbounded `findMany`
  queries (`membership`, `loyaltyTransaction`, `message`) over the full window — no DB-side
  aggregation. `dashboard/[businessId]/page.tsx` additionally loads **every** membership row
  (`memberships: { select: { joinedAt, pointsBalance } }`) just to derive totals.
- Charts are hand-rolled `<div>` bar "Sparklines" — no real charting, no tooltips/legends/axes.
- Redis cache (`data-cache.ts`) only covers the default 8-week window; 5-min TTL; invalidated nowhere
  on write (purely TTL-based).
- **No product analytics / RUM at all** — no PostHog/GA/Plausible, no web-vitals, no funnel or
  event tracking, no client-side telemetry.

**AI**
- RAG is single-shot: embed query → `findSimilarDocumentChunks` top-5 (`<=>` cosine) → stuff into
  prompt. No similarity threshold (returns 5 chunks even when all irrelevant), no reranking, no
  hybrid (keyword+vector) search, no query rewriting/expansion, no conversation summarization
  (history hard-truncated to 12 turns).
- Query embeddings are not cached; identical questions re-embed every time.
- Anthropic path has **no prompt caching** — the (large) system prompt + retrieved context is re-sent
  uncached on every turn.
- pgvector HNSW index exists (migration `0016`) — good — but an older ivfflat index (`0006`) also
  exists; needs reconciliation.
- Token accounting (`ai-usage.service.ts`) records a usage row per message but does **not** capture
  real input/output token counts from the model response — quota is message-count based, billing/cost
  visibility is blind.
- No RAG eval harness, no answer-grounding/guardrail beyond the system prompt.

**Performance / Loading**
- **29 pages declare `export const dynamic = "force-dynamic"` and there is zero `revalidate`/PPR usage**
  — every dashboard and public page hits the DB on every request, no ISR/segment caching.
- 44 client components; **no `next/dynamic` lazy-loading** of heavy client code (chat interface, charts).
  (Tesseract.js is already correctly `await import()`-ed — good.)
- `loading.tsx` exists for most routes (good); `Suspense` used in only one page (dashboard index).
- Only 2 `next/image` usages (imagery is light, but logos/avatars/promo images should be audited).
- No `<Link>` prefetch strategy; no bundle analyzer in CI; `optimizePackageImports` + `removeConsole`
  already configured (good).

---

## Workstream A — Analytics

Goal: (1) business analytics that scale and look production-grade, and (2) first-class product
analytics + RUM so we can see funnels, retention, and real-world performance.

### A1 — Push aggregation into the database (correctness + scale)
**Why:** loading every membership/transaction/message row into Node and bucketing in JS is O(rows)
memory and will fall over for a busy tenant.
- Replace the three `findMany` calls in `_getBusinessDashboardAnalytics` with grouped SQL using
  `date_trunc('week', "createdAt")` (Postgres) via `prisma.$queryRaw`, returning one row per
  (week, metric). Same for the 30-day KPIs (`SUM`/`COUNT` with `FILTER (WHERE ...)`).
- Remove the unbounded `memberships` select from `dashboard/[businessId]/page.tsx`; derive member
  count + points totals from `_count` and a single aggregate query.
- Add covering indexes if `EXPLAIN ANALYZE` shows seq scans (existing `@@index([businessId, joinedAt])`,
  `([businessId, createdAt])`, `([businessId, direction, createdAt])` likely already cover these — verify).
- **Acceptance:** dashboard + analytics queries are constant memory; `EXPLAIN` shows index usage;
  numbers match the old implementation in a unit test seeded with known data.

### A2 — Cache correctness
- Make the analytics cache key include `weeks` so the 4/12/26-week views are cached too (today only 8w).
- Add **explicit invalidation**: call `cacheDel(analyticsKey(...))` from loyalty/membership/message
  write paths (or accept the 5-min TTL and document it — recommend TTL + event-based bust on
  earn/redeem so staff see their own action reflected immediately).
- **Acceptance:** issuing points then reloading analytics reflects the change within one request.

### A3 — Real charting + richer KPIs
- Adopt a charting library. **Recommendation: Recharts** (mature, SSR-friendly, tree-shakeable) or
  lightweight **visx** if bundle size is critical. Render charts in a **client component lazy-loaded
  via `next/dynamic`** (see C2) so the chart bundle never blocks first paint.
- Replace `Sparkline` with proper area/bar charts: axes, tooltips, legends, responsive container.
- Add KPIs the current view lacks: **member retention / cohort** (joins vs still-active by week),
  **redemption rate trend**, **top rewards**, **active vs dormant members**, **points liability**
  (outstanding balance × value), **AI usage vs plan quota**.
- Add **CSV export** of the current view (server action streaming `text/csv`).
- **Acceptance:** analytics page renders charts with no layout shift; export downloads a valid CSV.

### A4 — Product analytics + RUM
**Why:** we currently have zero visibility into how users move through join → earn → redeem, or what
real-world load times are.
- **Recommendation: PostHog** (self-hostable, EU/own-region option for POPIA, product analytics +
  session replay + feature flags + web-vitals in one). Alternative: Plausible (privacy-first, simpler,
  no funnels) or GA4 (free, heavier, consent burden). Decision needed — see "Open decisions".
- Add a thin, consent-aware wrapper `src/lib/telemetry.ts`:
  - Client provider mounted in root layout, **gated on cookie consent** (POPIA — the repo already has
    a cookies/privacy page; wire consent state to telemetry init).
  - Server-side capture helper for funnel events fired from server actions (join, earn, redeem,
    receipt submit, AI message, subscription upgrade).
  - Strip PII (phone, email) before capture; reuse the pino redaction allowlist.
- **Web Vitals (RUM):** add `useReportWebVitals` reporting LCP/INP/CLS/TTFB to the telemetry sink
  (and optionally to `/api/metrics` for the existing Prometheus pipeline).
- Define a small **event taxonomy** doc (event name, properties, when fired) so events stay consistent.
- **Acceptance:** join→earn→redeem funnel visible in the analytics tool; web-vitals flowing; no PII in
  captured payloads; events suppressed until consent granted.

---

## Workstream B — AI

Goal: materially better answer quality, real cost/token visibility, and a quality bar we can defend.

### B1 — Retrieval quality (biggest answer-quality lever)
- **Similarity threshold:** drop matches below a tuned cosine threshold instead of always returning 5;
  when nothing clears the bar, tell the model "no supporting context" so it declines rather than
  hallucinating. (`findSimilarDocumentChunks` already orders by distance — add a `WHERE` / post-filter.)
- **Over-fetch + rerank:** retrieve top-20 by vector, then rerank to top-5 with a cross-encoder
  (Cohere Rerank or a local bge-reranker via Ollama). Falls back to pure vector if reranker unavailable.
- **Hybrid search:** add Postgres full-text (`tsvector`/`websearch_to_tsquery`) over `DocumentChunk.content`
  and fuse with vector scores (Reciprocal Rank Fusion). Catches exact terms (SKU, hours) that embeddings miss.
- **Query rewriting:** for multi-turn chats, rewrite the latest user turn into a standalone query using
  recent history before embedding (cheap LLM call or heuristic) so follow-ups retrieve correctly.
- **Acceptance:** measured improvement on the eval set (B5); irrelevant-context answers now decline.

### B2 — Embedding + retrieval performance
- **Cache query embeddings** in Redis keyed by `sha256(text)` (TTL ~1h) — identical questions skip the
  embedding round-trip.
- **Reconcile vector indexes:** confirm HNSW (`0016`) is the live index and drop the stale ivfflat
  (`0006`) if redundant; set `hnsw.ef_search` for the query workload; document the tradeoff.
- **Remove the sha256 fallback embedding from any prod path** — it produces semantically meaningless
  vectors. Keep it only behind an explicit dev flag; in prod a missing embedder should fail loudly
  (it already throws in prod — verify and lock down).

### B3 — Prompt caching + model strategy (cost + latency)
- **Anthropic prompt caching:** mark the system prompt + retrieved-context block with
  `cache_control: { type: "ephemeral" }` so repeated turns in a session reuse the cache (big cost/latency
  win on multi-turn chats). Implement in `lib/ai/anthropic.ts`. (See the `claude-api` skill for the
  exact SDK shape; default to the latest Claude models.)
- Make the fallback model configurable per business tier (e.g. Haiku for FREE, Sonnet for paid) via
  `aiWorkspace`.
- **Acceptance:** cache-hit metric exposed; measurable token reduction on the 2nd+ turn of a session.

### B4 — Real token accounting + cost guardrails
- Capture actual `usage.input_tokens` / `output_tokens` (Anthropic) and Ollama eval counts from the
  stream's final frame; persist on `aiTokenUsage` in `finalizeAiTokenUsage` (today it records runtime/
  model only).
- Surface per-business token spend in analytics (A3) and enforce a **token** budget alongside the
  existing message-count quota.
- **Acceptance:** `aiTokenUsage` rows carry real token counts; cost dashboard reflects them.

### B5 — RAG evaluation harness + guardrails
- Build a small golden-set eval (`tests/ai/rag-eval/`) — ~30 Q/A pairs per representative business with
  expected source docs; score retrieval (recall@k, MRR) and answer faithfulness. Run in CI (gated, not
  blocking) so retrieval changes are measured, not vibes.
- Add answer-grounding guardrail: post-generation check that the answer cites at least one retrieved
  source when context existed; log ungrounded answers as a metric.
- **Acceptance:** eval runs in CI and emits scores; regressions visible in PRs.

### B6 — Conversation memory
- For sessions exceeding the 12-turn window, summarize older turns into a rolling summary instead of
  dropping them, so long support conversations keep context.

---

## Workstream C — Performance / Loading

Goal: fast first paint, minimal JS, instant navigation between tabs/pages, and a measurable budget.

### C1 — Caching & rendering strategy (highest impact)
- **Audit the 29 `force-dynamic` pages.** Most are dynamic only because they call `auth()`/read cookies.
  Split each page into a cached static shell + a dynamic, `Suspense`-wrapped data section so the shell
  streams instantly. Use **`revalidate`/`unstable_cache`** for tenant-public pages (`b/[slug]`,
  discover, categories) and **PPR (Partial Prerendering)** where Next 15 supports it.
- Wrap slow data reads (analytics, message lists) in `<Suspense>` with the existing `loading.tsx`
  skeletons so navigation paints immediately and data streams in (today only the dashboard index does this).
- **Acceptance:** public pages served from cache (verify `x-nextjs-cache`); dashboard tabs paint shell
  < 200ms TTFB locally; no full-page DB block before first byte.

### C2 — Code splitting / bundle
- Lazy-load heavy client components with `next/dynamic` (`ssr: false` where appropriate): the AI chat
  interface, the new chart components (A3), the receipt-upload/OCR card. Keep them off the initial route bundle.
- Add **`@next/bundle-analyzer`** behind an `ANALYZE=1` flag and a CI step that fails if any route's
  first-load JS exceeds a budget (e.g. 180KB gzip). Establish the budget from the current baseline.
- Audit the 44 `"use client"` files — push state down so pages stay Server Components where possible.
- **Acceptance:** initial route JS drops; analyzer report attached to CI; budget enforced.

### C3 — Navigation / tabs / links
- Adopt an explicit `<Link>` prefetch strategy: prefetch primary nav (bottom-nav, sidebar, dashboard
  tabs) on hover/viewport; leave low-value links default. Today there is no prefetch tuning.
- For the dashboard tab bar, ensure shared layout segments aren't re-fetched on tab switch (App Router
  layouts already help — verify with the Network panel and add `loading.tsx` where a tab still blocks).
- **Acceptance:** tab switches feel instant (prefetched); no duplicate layout data fetches.

### C4 — Images & assets
- Audit all imagery (business logos, avatars, promo images, OG images) onto `next/image` with correct
  `sizes`/`priority` for LCP elements; confirm R2 remote patterns cover prod hosts (they do in `next.config.ts`).
- Preconnect/dns-prefetch to R2 and the AI provider origins.

### C5 — Performance budgets in CI
- The repo already runs Lighthouse in CI — tighten the assertions (currently relaxed) into a real
  budget for LCP/INP/CLS/TBT on key routes (landing, sign-in, dashboard, public business profile).
- Feed the Web Vitals RUM (A4) so we track field data, not just lab.

---

## Sequencing (recommended)

1. **C1 + A1** first — rendering/caching strategy and DB-side aggregation. These remove the biggest
   scalability and latency risks and unblock everything else.
2. **A3 + C2** — charts (lazy-loaded) land together so the chart bundle is split from day one.
3. **B1 + B2** — retrieval quality + embedding cache (the AI answer-quality core).
4. **B3 + B4** — prompt caching + real token accounting (cost/latency, feeds A3's AI-cost KPI).
5. **A4 + C3 + C4 + C5** — product analytics/RUM, nav prefetch, images, CI budgets.
6. **B5 + B6** — eval harness + conversation memory (quality ratchet, ongoing).

Each numbered group is a PR-sized unit with its own tests. Nothing here requires a schema-breaking
migration except A1 (none — read-only) and B4 (additive columns already exist on `aiTokenUsage`).

## Decisions (resolved 2026-06-04)

1. **Product analytics tool (A4): PostHog** — funnels + session replay + flags + web-vitals, self-hosted
   in-region for POPIA. Must be consent-gated and PII-scrubbed.
2. **Charting library (A3): Recharts** — lazy-loaded via `next/dynamic` so it stays off the initial bundle.
3. **Reranker (B1): local bge-reranker via Ollama** — no external dependency/cost; graceful fallback to
   pure-vector retrieval if the model isn't pulled (mirrors the Ollama→Anthropic fallback pattern).
4. **Cache-busting vs TTL (A2):** resolved — shipped as TTL + event-based bust on earn/redeem/adjust
   (`analyticsKeysForBusiness()` called from `loyalty.service.ts`) so staff see their own action immediately.

## Risks / notes
- POPIA: product analytics + session replay must be consent-gated and PII-scrubbed; coordinate with the
  existing cookies/privacy pages.
- PPR is still evolving in Next 15 — fall back to Suspense streaming where PPR is unstable.
- Reranker/external embedding add a network dependency on the AI hot path — keep graceful fallback to
  pure-vector retrieval (mirror the existing Ollama→Anthropic fallback pattern).
