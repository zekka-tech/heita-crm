# Heita CRM — Senior CTO Advisory & Investment Memorandum

*Prepared: 14 June 2026 · Refreshed: 16 June 2026 (grade scorecard + acquisition-plan refresh) · Author: Senior CTO Advisor · Status: Diligence refresh (post-remediation)*

> This memo supersedes (and replaces) the original root `CTO_ADVISORY_INVESTMENT_MEMO.txt`, which has been removed.
> It is backed by three deep-dive workstreams produced under it:
> - [`01-technical-due-diligence.md`](./01-technical-due-diligence.md) — code-grounded technical audit
> - [`02-market-competitive-swot.md`](./02-market-competitive-swot.md) — market, moat, SWOT, competitors by region
> - [`03-gtm-marketing-advertising.md`](./03-gtm-marketing-advertising.md) — acquisition, advertising, unit economics
>
> **16 June 2026 refresh notes.** Added the dimension-level **letter-grade scorecard** (§1a) used in the verbal CTO
> review; refreshed measured metrics to current `main`; recorded that the CAC-richness telemetry items
> (`first_reward_created`, lead-source/UTM attribution), the per-channel **CAC/LTV cohort dashboard** (`/admin/cac-ltv`),
> **and the B2B merchant referral loop** (Rand account credit, settled on the referred merchant's first paid invoice,
> auto-applied at checkout) are **all now shipped** — clearing the GTM build backlog the prior memo flagged.

---

## 1. Executive Verdict

**Heita CRM is a genuine category-creation play occupying an empty quadrant of the SMB software map — WhatsApp × loyalty × per-tenant AI co-worker × PWA × franchise multi-tenancy × ZAR-native — built to a standard well above the typical seed-stage codebase.** It is a ~54,200-LOC TypeScript monorepo (measured on current `main`): 428 source files, 46 Prisma models + 28 enums, 44 migrations (`0001`–`0044`), 40 API routes, 47 domain services, 654 unit/integration cases across 102 test files, 11 Playwright E2E flows, 20 operational runbooks, and a real SLO/error-budget/runbook operating layer. Across 54k LOC there are **0 TODO/FIXME markers, 4 type-escapes, and 0 production npm vulnerabilities** (the 7 outstanding audit items are the dev-only `@lhci/cli` semver-major chain). This is not a prototype.

**Corrected production-readiness score: 8.3/10** — well short of the prior 9.5/10 internal claim but improved from 8.0 with the closure of the public ISR gap, SSRF TOCTOU/robots redirect hardening, explicit system-scope support for cross-tenant jobs, and the second wave of service scoping. The largest remaining gap is that tenant isolation is only **partially verified end-to-end** despite now covering the main scoped runtime services, self-service user-scoped reads, and explicit cross-tenant cron/export/account paths. The code provisions `heita_app` in CI with a live RLS smoke test, and public-surface ISR conversion (including `b/[slug]/events`) is complete. The remaining work is proving the broader app green under the runtime role.

**The investment case is real, asymmetric, and time-boxed.** The window in which (a) WhatsApp Business API is cheap, (b) Meta has not shipped native SMB loyalty/AI, (c) no global SaaS has stitched per-tenant RAG into the emerging-market SMB stack, and (d) POPIA/SADC/AfCFTA create a procurement moat — is **18–24 months**. The durable moat is **not** WhatsApp-nativeness (a commodity Meta gates) nor data-residency (protects only the SCALE tier); it is **per-tenant RAG institutional memory compounding with franchise switching cost and loyalty-point liability.**

**Recommendation: fundable at seed / seed-extension, USD 3.5–5.0M (R65–90M) at R140–180M pre-money**, released against the four milestones in §8. I have trimmed both the valuation and the TAM from the prior memo on the basis of corrected sizing and the unproven-RLS finding — and I would make the RLS verification a condition precedent to the first tranche.

---

## 1a. Dimension Scorecard (CTO letter grades)

This is the at-a-glance grade view used in the verbal CTO review, mapped to the numeric scores carried in §4 and the workstream memos. The headline: **the technology is ahead of the go-to-market.** "Can they build it" is essentially answered; the thesis now rides on **focus and distribution.**

| Dimension | Grade | One-line |
|---|---|---|
| Build quality / engineering | **A−** | Disciplined, tested, secure; breadth is the main quality risk |
| Production readiness | **B+** | Strong infra/SRE posture; gated by ops staffing & real-load proof |
| Product scope / ambition | **A** | Closed loyalty↔wallet↔messaging↔AI loop, franchise-aware, real sales pipeline |
| Moat | **B** | Workflow + switching-cost moat, not a platform/network moat (yet) |
| Market fit (SA beachhead) | **A−** | Channel + behaviour + price fit is excellent in South Africa |
| Distribution / GTM | **C+** | The single biggest gap; no proprietary merchant channel |
| Defensibility vs. incumbents | **B−** | Beats startups on bundle; loses to payments incumbents on reach |
| **Overall (weighted)** | **B+ / 8.3-of-10** | Fundable, unusually well-engineered; underwrite the moat, gate on RLS proof, measure CAC |

**Why the spread between an A− engineering grade and a C+ distribution grade matters:** Heita is a rare seed-stage company where the build de-risks the technical question almost entirely, leaving an unusually clean — and unusually concentrated — bet on whether the team can win South African franchise / multi-location accounts via partnerships **before** a payments incumbent (Yoco, iKhokha) decides loyalty + WhatsApp + AI is worth bundling into its existing merchant base. The grades above are deliberately not all A's: the C+ on distribution and B− on incumbent defensibility are the two cells an investor should spend diligence time on.

---

## 2. What Ships Today (verified against code)

| Surface | Capability | Maturity |
|---|---|---|
| Auth | Phone OTP (Africa's Talking), Google, Apple; Auth.js v5; session version-bump on privilege change; staff step-up OTP | Production |
| Loyalty | Tiered points, expiry, refunds, signup/referral bonus, redeem; idempotent + audited; expiry cron | Production |
| Messaging | WhatsApp Cloud API (HMAC webhook); SMS/email/push/in-app via a real channel-fallback orchestrator (`IN_APP→WhatsApp→PUSH→SMS→EMAIL`); quiet-hours + opt-in | Production |
| Heita Connect | In-app SSE messaging: delivery/read ticks, typing indicators, presence heartbeat, block/report (audited), POPIA retention purge | Production |
| AI co-worker | Per-tenant pgvector(1024) + HNSW; hybrid FTS+vector fused via RRF; query rewriting; reranking; BYOM (Anthropic/OpenAI/Gemini/DeepSeek/Ollama) with BYOK→Ollama→Anthropic fallback; token accounting | Production |
| Receipt OCR | In-browser Tesseract.js (PWA-friendly) + DeepSeek vision fallback; staff review queue; batch import (Growth/Scale) | Production |
| Sales pipeline | Custom stages, BullMQ follow-ups, AI-drafted (staff-approved) replies, outbound documents | Production |
| Multi-tenant | `businessId` scoping; FORCE RLS migration + two-role DB design; `withBusinessScope` + `withUserScope` + `withSystemScope`; CI static IDOR gate + live RLS smoke test | **Architected, partially verified (§3)** |
| Franchise | Parent/child hierarchy; role enum incl. `FRANCHISE_ADMIN` | Production |
| Billing | 4 tiers (FREE/STARTER R499/GROWTH R1,499/SCALE R4,999) × Yoco/Stripe/PayFast registry | Production |
| PWA / offline | Installable customer shell; service-worker offline outbox (IndexedDB + Background Sync) | Production |
| i18n | next-intl: en-ZA, af, zu, xh | Beta-Production |
| Observability | Sentry, OTel, pino (redacted), Prometheus, Alertmanager burn-rate, 22 runbooks, error-budget release gate | Production |
| DevOps | Multi-stage non-root Docker, GHCR+Cosign, Trivy, Gitleaks, SBOM, migration-drift gate | Production |

---

## 3. The Central Technical Finding — Multi-Tenant Isolation

**This is the one issue that governs the score and should govern the term sheet.**

- **Design is correct and fails closed.** RLS policies use `current_setting('app.current_business_id', true)` (missing-ok). With the GUC unset, the predicate evaluates to NULL → **zero rows**, never a cross-tenant leak. FORCE RLS is applied to ~34 business-owned tables; the app role `heita_app` is `NOBYPASSRLS`; migrations run as a separate `BYPASSRLS` owner. This is the right architecture.
- **It is now partially verified end-to-end.** CI still uses the owner role for the main unit/E2E flows, but it now also provisions `heita_app` and runs a live RLS smoke test proving that a foreign-tenant read returns zero rows until `app.current_business_id` is set. That materially improves confidence, but it is not yet the same as running the whole app and full suite under the runtime role.
- **And it remains inconsistently applied, but materially advanced.** Ten services are now scoped via `withBusinessScope` (analytics, AI provider, vector, usage, staff-invite, ai-workspace, customer-import, inbound-address, web-source, segment — all verified). The second sweep closed the document/workspace-oriented flows gap identified in the prior audit. The residual risk is now "correct architecture with materially advanced but incomplete rollout."

**Net:** the security posture is *safe-by-fail-closed* and now has a real live-policy proof point, but the headline "RLS fully enforced, 9.5/10" remains **too strong**. This is still a credibility issue more than a live-leak issue — and it is exactly the kind of nuance a Series-A technical partner will ask about.

**Remediation (condition precedent to tranche 1, ~2–4 weeks):**
1. Stand up a CI Postgres job that connects as `heita_app` and runs real cross-tenant isolation assertions.
2. Sweep the ~21 unscoped services onto `withBusinessScope` (or confirm each is intentionally public).
3. Flip a staging environment to `heita_app` and run the full E2E suite to surface "zero-row" regressions before they reach prod.
4. Promote the dev-only `[RLS-WARN]` Prisma extension to a CI-failing assertion.

---

## 4. Build Quality & Production Readiness — Scorecard

| Dimension | Score | Notes |
|---|---|---|
| Code quality & hygiene | 9/10 | 1 TODO / 3 type-escapes / 0 vulns across 53k LOC; clean service layering |
| Security controls | 8.5/10 | Real HMAC, SSRF guard with `fetchWithPinnedIp` socket pinning, AES-256-GCM, CSP/CSRF, 3-tier OTP RL; SSRF TOCTOU and robots redirect resolved |
| Multi-tenant isolation | 6.5/10 | Correct + fail-closed; 10+ services now scoped + live CI smoke test; full app-role rollout still incomplete (§3) — the score cap |
| AI/RAG pipeline | 9/10 | Hybrid RRF retrieval, reranking, BYOM fallback, quota under serializable isolation |
| Test coverage & CI | 8.5/10 | Investor-grade gates; live RLS smoke test now running; expanded service scoping improves confidence; full app-role suite still outstanding |
| Scalability | 7/10 | Single-Postgres + per-request-transaction ceiling; good indexing; BullMQ offload |
| Observability & ops | 9/10 | Prometheus/OTel/Sentry/pino, 22 runbooks, error-budget gate, health probes |
| Documentation honesty | 7/10 | Strong docs; recurring docs-vs-reality over-claims (the 9.5/10 RLS claim; prior force-dynamic gap) |
| **Overall** | **8.3/10** | Honest mid-8; SSRF and ISR gaps are closed, hard-cap docs are honest again, and there is a clear path to 8.5–9 once the runtime-role rollout is proven app-wide |

**Top 5 technical risks:** (1) **Critical** — partial/incomplete RLS runtime-role verification despite scoped runtime helpers and explicit system-scope admin paths now landing (med effort); (2) **High** — single-maintainer bus factor (all commits one author); (3) **Medium** — AI overage price exists in plan metadata but is not a live billed path; collateral must stay on strict hard-cap semantics unless billing is truly shipped; (4) **Low** — SSRF hardening complete (socket pinning, robots redirect); (5) **Medium** — single-Postgres scaling ceiling at 10–100×.

---

## 5. Market, Moat & SWOT (synthesis of §02)

**Sizing — corrected.** The prior memo's R11.2bn SA TAM blends in ~2.5m informal firms that will never pay SaaS. Realistic SA TAM is **R4.5–6.0bn**; size bottom-up from **~250–400k formal, addressable firms**. 96% WhatsApp penetration is a *reachability* moat, not a *monetization* base.

**Moat — rated.**
| Element | Strength | Reasoning |
|---|---|---|
| Per-tenant RAG memory | **Strong** | Value compounds with tenure; leaving abandons a trained co-worker |
| Franchise roll-up + loyalty liability | **Strong** | Structural switching cost; members hold point balances |
| WhatsApp-nativeness | **Weak** | Commodity API every BSP has; Meta gates it |
| POPIA / data-residency / local rails | **Moderate** | Real, but protects only SCALE/enterprise; erodes as global players spin up af-south-1 |
| Network effects | **Moderate** | Customer→business and cross-outlet loops exist but unproven at scale |

**Defensible window: 18–24 months**, carried by RAG + franchise + loyalty — **not** WhatsApp or POPIA.

**Biggest competitive threat by region:**
- **South Africa** — a *payments incumbent* (Yoco 200k+ merchants; iKhokha/Nedbank) bundling loyalty+WhatsApp into an existing base. A distribution gap, not a feature gap → **partner with a rail before they build.**
- **Asia/India** (hardest) — AiSensy's ₹999 floor makes GROWTH look 3–5× expensive for messaging-only buyers; **do not lead expansion here.**
- **LATAM/Brazil** (best fit; 96% WhatsApp, mirrors SA) — threat is Mercado Pago / Nuvemshop distribution-led encroachment.
- **Europe** — SleekFlow is the better-funded architectural look-alike; **partner/white-label only.**
- **North America** — different lane (SMS/email-native, USD, wrong tier); an **acquirer pool, not a market.**

**Single biggest strategic risk: Meta first-party encroachment.** If WhatsApp Business ships native SMB loyalty+AI at <R200/mo, the wrapper value collapses. The only hedge is the workspace layer Meta has shown no interest in — per-tenant RAG, franchise topology, loyalty math — and keeping WhatsApp <40% of message volume via the multi-channel dispatcher.

**Category verdict:** genuine **category creation** (empty quadrant), with the honest caveat that the quadrant is empty partly because it is *hard to monetize* and *expensive to educate*.

---

## 6. Go-to-Market & Unit Economics (synthesis of §03)

**Highest-ROI channel: founder-led community + partnership distribution.** In a low-trust, relationship-led informal market, a trusted intermediary signing the anchor business converts cheapest: **R80–R350 tenant CAC at 0.6–1.0-month payback** via township chambers, stokvel/NASASA federations, spaza co-ops; **R50–R400 CAC** via Yoco/PayFast rev-share, FMCG distributor route-to-market, and franchise HQs. Meta click-to-WhatsApp ads are the best *creative fit* (8-second demo) but scale the funnel rather than lead it (R450–R2,200 blended CAC).

**Unit economics (early-cohort base case):**
| Tier | LTV | CAC | Payback | LTV:CAC |
|---|---|---|---|---|
| STARTER (R499) | ~R11.7k | ~R600 | 1.4 mo | ~19× |
| GROWTH (R1,499) | ~R36k | ~R1,400 | 1.1 mo | ~26× |
| SCALE (R4,999) | ~R108k | ~R5,500 | 1.3 mo | ~20× |
| **Blended** | — | — | **<1.5 mo** | **27× (Y1) → 57× (Y3)** |

**Honesty flag for the IC:** the 20–57× ratios are *early-cohort*, resting on very low SA SMB CAC, 84% gross margin, and a 3-year LTV cap. At steady state with mature emerging-market SMB churn (~3%/mo) and saturating cheap channels, **expect blended LTV:CAC to settle at 6–10×.** The genuinely underwritable figure is the **sub-1.5-month gross-profit payback**, which holds across every tier.

**18-month GTM budget: ~R7.2M**, phased SA founder-led → SA paid scale → Africa expansion. The event contract is now complete — `first_reward_created` (activation milestone) and lead-source/UTM campaign attribution on the join funnel shipped in the 16 June refresh, joining `checkout_started`, `subscription_started/upgraded`, and `provider_selected` — **and the per-channel CAC/LTV cohort dashboard is now wired in-app** at `/admin/cac-ltv` (platform-admin gated), computing CAC/LTV/ratio and monthly cohorts from persisted business attribution + paid invoices + a new `AdSpend` table. The remaining dependency is **operational, not engineering**: log real ad spend and widen attribution capture so the measured numbers firm up.

**Biggest GTM risk:** Meta dependency (template-approval tax across 30+ templates × 4 languages; CTWA pricing). Mitigation: own distribution via partnerships; keep WhatsApp <40% of volume.

---

## 7. SWOT (condensed)

**Strengths** — differentiated per-tenant RAG; clean 53k-LOC codebase with investor-grade CI; 4-tier ZAR-native pricing with local rails; real multi-channel de-risking of Meta dependency; sub-1.5-month payback.

**Weaknesses** — incomplete app-role RLS rollout (§3) despite broad service scoping (10+ services plus self-service reads now scoped); single-maintainer bus factor; no native POS integration; AI usage is still a hard cap rather than a monetized overage path; the B2B referral loop is now shipped but unproven in-market (credit application is wired across all three checkout providers — Yoco, Stripe, PayFast — and referral CAC is surfaced in `/admin/cac-ltv`, but no referral cohorts have converted yet); category-education cost.

**Opportunities** — LATAM/Brazil as a near-clone of SA; payments-rail and FMCG-distributor partnerships as owned distribution; franchise roll-up as a land-and-expand wedge; AfCFTA/POPIA procurement tailwind.

**Threats** — Meta first-party encroachment (existential); payments incumbents bundling (SA); price-floor competitors (India); well-funded look-alikes (Europe); emerging-market SMB churn and informal-sector WTP.

---

## 8. Recommendation & Milestone Structure

**Fund: USD 3.5–5.0M (R65–90M) at R140–180M pre-money, seed / seed-extension.**

**Conditions precedent (tranche 1 release):**
1. RLS verified end-to-end against live Postgres as `heita_app`; unscoped services swept; staging runs green under the app role. *(§3 — the single most important gate.)*
2. Keep AI usage on strict hard-cap semantics in pricing and investor collateral until a cent-accurate overage billing path is genuinely live. (`isOverage` exists in schema metadata, but production still hard-caps usage.)
3. PostHog per-channel CAC dashboard live (M3) — converts forecast LTV:CAC into measured.

**18-month milestones an investor can underwrite:**
| # | Milestone | Target |
|---|---|---|
| M6 | SA paying tenants; verified RLS; measured CAC | 250–400 paying, blended CAC < R650, payback < 1.5 mo |
| M12 | SA scale + first partnership rail live | 1,000–1,500 paying, ≥1 payments/FMCG distribution deal, net revenue retention > 100% |
| M12 | De-risk Meta | WhatsApp < 40% of message volume; B2B referral loop shipped |
| M18 | First Africa/LATAM pilot | Brazil or Nigeria pilot cohort; localized pricing tier; RAG/franchise lock-in demonstrated |

**Why this is the right structure:** it ties capital release to the two things that convert this from a strong story into a defensible asset — *proven* tenant isolation and *measured* acquisition economics — while funding the moat (RAG + franchise + loyalty lock-in) to outrun the one existential threat (Meta) inside the 18–24-month window.

**Bottom line: a fundable, unusually well-engineered, honestly-mid-8 asset in an empty and timely quadrant. Underwrite the moat, gate on the RLS proof, and measure the CAC — and the asymmetry is real.**

---

*Backing detail: [`01-technical-due-diligence.md`](./01-technical-due-diligence.md) · [`02-market-competitive-swot.md`](./02-market-competitive-swot.md) · [`03-gtm-marketing-advertising.md`](./03-gtm-marketing-advertising.md)*
