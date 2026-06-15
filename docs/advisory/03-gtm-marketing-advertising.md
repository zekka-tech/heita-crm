# Heita CRM — User-Acquisition, Advertising & Marketing Strategy

*Investment Memorandum · Section 3 of the advisory series · Prepared June 2026 · Author: Senior Growth/GTM Advisor · Status: Pre-investment diligence*

> **Scope note.** This section is grounded in what actually ships. The real billing ladder in `src/lib/billing.ts` is **FREE (R0) / STARTER (R499) / GROWTH (R1,499) / SCALE (R4,999)** — a 4-tier ladder, *not* the 6-tier "STARTER S/M + ENTERPRISE" ladder proposed in the CTO memo §7.2. All economics below use the shipped tiers. The shipped referral engine (`src/server/services/referral.service.ts`) is **customer-to-customer within a single business** (a member refers a member; the referrer earns points after the referral's first purchase). A **business-to-business** referral loop — the one that actually drives tenant CAC down — is **not yet built** and is flagged as a required investment, not an existing asset. Also note: the R0.20/msg AI overage price is configured in plan metadata, but the live code currently enforces a hard cap rather than billing overage traffic.

---

## 0. The shipped tiers (ground truth)

| Tier | ZAR/mo | ZAR/yr | Members | Staff seats | AI replies/mo | WA templates/mo | In-app msgs/mo | AI overage |
|---|---|---|---|---|---|---|---|---|
| **FREE** | 0 | 0 | 500 | 1 | 200 | PAYG | 200 | Configured price; hard cap currently enforced |
| **STARTER** | 499 | 4,990 (2 mo free) | 3,000 | 3 | 1,500 | 1,000 | 1,000 | Configured price; hard cap currently enforced |
| **GROWTH** | 1,499 | 14,990 (2 mo free) | 10,000 | 5 (+R149/seat) | 5,000 | 3,000 | 5,000 | Configured price; hard cap currently enforced |
| **SCALE** | 4,999 | 49,990 (2 mo free) | 100k soft cap | 25 (+R99/seat) | 25,000 | 20,000 | 25,000 | Configured price; hard cap currently enforced |

Annual billing already gives **2 months free** (10× monthly), which is the single most important churn-and-cash lever in an emerging-market SMB book and should be the *default* offered at checkout, not a hidden option.

---

## 1. Acquisition strategy by funnel stage & ICP

### 1.1 Funnel model

Heita has **two stacked funnels** that the telemetry contract (`src/lib/telemetry-events.ts`) already instruments:

1. **Consumer funnel (free, viral fuel):** `business_joined` → `membership.joined` → `points_earned` → `points_redeemed`. This is the network-effect substrate. Consumers cost ~R0 to acquire because the *business* brings them in via QR/WhatsApp.
2. **Tenant funnel (revenue):** signup → activation → `subscription_started` → `subscription_upgraded`. This is where CAC is spent.

The entire GTM thesis is: **spend to acquire businesses; let businesses acquire consumers for free; let consumers' presence re-acquire businesses.** Every rand of paid CAC must be aimed at the *tenant* funnel, and judged on tenant LTV.

### 1.2 Funnel-stage → channel map

| Funnel stage | Job-to-be-done | Primary channels | Secondary |
|---|---|---|---|
| **Awareness** | "There's a WhatsApp loyalty tool built for me" | Meta/IG/TikTok Reels, founder community, PR, SEO | YouTube how-to, telco co-marketing |
| **Consideration** | "It runs on my phone, in my language, costs R0 to try" | Free-tier landing page, WhatsApp demo bot, YouTube walkthroughs (zu/xh/af) | Comparison SEO, partner referral |
| **Activation (free)** | First member joined + first reward set up = aha | In-product onboarding, WhatsApp nudges, CS-assisted setup | Field reps for SCALE |
| **Monetisation** | Free→Starter→Growth upgrade | In-product upgrade prompts at quota walls, lifecycle WhatsApp/email | Inside-sales call for Growth+ |
| **Expansion** | Add outlets, seats, vertical use | CSM, franchise HQ land-and-expand, field sales | Annual-plan upsell |
| **Referral** | Business invites business; member invites member | B2B referral engine (to build), in-product C2C referral (shipped) | Partner co-sell |

### 1.3 Channel-by-channel plan (persona · CAC · payback · fit)

CAC ranges are **blended tenant-acquisition cost in ZAR** (ad/effort spend ÷ paying tenants acquired), flagged as estimates with reasoning. Payback uses **gross-profit payback** = CAC ÷ (ARPU × gross margin).

#### A. Founder-led / community (township business associations, stokvel networks, spaza co-ops)

- **Target persona:** Spaza owner (FREE), hair/beauty salon (STARTER), independent café (STARTER/GROWTH). The informal-and-formalising long tail.
- **Estimated CAC:** **R80–R350** per paying tenant. *Reasoning:* cost is founder/community-rep time + small incentives (data bundles, printed QR table-talkers), not media. A community rep covering one township business association (SANTACO ranks, township chambers, stokvel federations like the National Stokvel Association of SA / NASASA networks) can sign 15–40 free businesses per month and convert 5–12% to paid; loaded rep cost ~R18–25k/mo ÷ ~6 paid = R200–R350.
- **Payback:** **0.6–1.0 months** at STARTER (R499 × 84% GM = R419 monthly GP).
- **Why it fits:** Distribution in low-trust informal markets is *relationship-led*, not click-led. The stokvel/co-op structure is a pre-aggregated, high-trust list. A trusted intermediary signing the chairperson's shop first creates a cascade. This is the **highest-ROI channel in Phase 1** and the backbone of the SOM-600 Year-1 milestone.

#### B. Paid social — Meta (FB/IG) + TikTok

- **Target persona:** Salon owner (STARTER), boutique/fashion (GROWTH), café (STARTER/GROWTH) — smartphone-first operators already running their business in IG DMs and WhatsApp.
- **Estimated CAC:** **R450–R2,200** per paying tenant blended; **R150–R600** per *free signup*, with a 6–12% free→paid conversion. *Reasoning:* SA Meta CPMs ~R40–R90, lead CPL R25–R90, free-signup cost R150–R600; multiply by 1/(conversion) for paid CAC. TikTok UGC is ~3× cheaper on top-of-funnel (CPL R15–R40) but converts free-to-paid worse, so it feeds free volume.
- **Payback:** **1.1–5.3 months** depending on tier landed; Growth landings pay back fastest in absolute rands (R1,499 × 84% = R1,259 GP/mo).
- **Why it fits:** The product is *demonstrable in 8 seconds* — "scan the till slip, points land in WhatsApp." Reels/UGC carry that better than any other medium, and the WhatsApp-native angle means the click-to-WhatsApp ad format (Meta CTWA) routes straight into a demo bot with zero landing-page friction. **CTWA is the single best-fit paid format for this product.**

#### C. Google Search / SEO

- **Target persona:** Higher-intent GROWTH/SCALE operators researching "loyalty app South Africa", "WhatsApp CRM", "spaza rewards system", "salon booking loyalty".
- **Estimated CAC:** Search **R900–R3,000** (CPC R8–R25, low SA volume, bottom-funnel intent); SEO **R250–R900** amortised once ranking (6-month lag).
- **Payback:** Search 2.1–7 months; SEO <1 month once organic compounds.
- **Why it fits:** Captures the minority of SA SMBs who *search* (mostly GROWTH/SCALE, English-medium). SEO is a long game but compounds and underpins category-creation PR. Keep paid Search budget modest (~10%) — search volume for SMB loyalty in SA is thin; the demand must be *created* (social/community), not just *captured* (search).

#### D. WhatsApp viral / referral loops (the product's own re-engagement loop as a growth engine)

- **Target persona:** All tiers — this is a *cost-reducer*, not a standalone channel.
- **Estimated CAC:** **R200–R450** *effective* for tenants acquired via business-to-business referral (cost = referral credit + reward points subsidy). For consumers, ~**R0**.
- **Payback:** <1 month; referral-sourced tenants also churn less (warm intro).
- **Why it fits:** Two loops already partially exist and one must be built (see §3). The shipped C2C referral (50-point default bonus, owner earns on referral's first purchase) drives *member* density per tenant — which raises tenant value and stickiness — but does **not** lower *tenant* CAC. The missing, high-leverage piece is a **business→business referral** (referring tenant gets account credit, e.g. R500, referred tenant gets a free month). This is the cheapest CAC line in the model and should be a funded build in the first 90 days.

#### E. Partnerships (Yoco/PayFast, telcos, FMCG distributors, franchise HQs)

- **Target persona:** Yoco/PayFast → all paying tiers (their 200k+ merchant base maps 1:1 to the ICP); telcos (Vodacom/MTN business) → STARTER/GROWTH; FMCG distributors (Coca-Cola, Tiger Brands, SAB route-to-market) → spaza FREE at massive scale; franchise HQs → SCALE.
- **Estimated CAC:** **R50–R400** per paying tenant (rev-share + co-marketing, near-zero media). *Reasoning:* partner owns the distribution and trust; Heita pays 15–25% rev-share rather than CAC. FMCG distributor reps already visit 100k+ spazas weekly — bundling a Heita QR into that route is the cheapest theoretical CAC in the entire plan.
- **Payback:** 0.5–1.5 months on the Heita-retained margin.
- **Why it fits:** This is the **structural unlock** for the SCALE tier and for spaza scale. The CTO memo correctly flags a Yoco/Stitch MOU as the single highest-leverage GTM deal. Partnerships also de-risk the Meta dependency by giving an owned distribution channel. **Recommendation: a named partnerships lead from Phase 2, targeting one payment-rail MOU (M9) and one FMCG distributor pilot (M12).**

#### F. Field sales (SCALE tier)

- **Target persona:** Small franchise / multi-store operator (5–30 outlets), R4,999/mo + seats.
- **Estimated CAC:** **R3,000–R8,000** per closed logo (BDR + AE time, demos, travel). Higher absolute CAC, but SCALE ACV is R60k+/yr.
- **Payback:** 1.5–3 months on a R4,199/mo GP base.
- **Why it fits:** Multi-outlet deals need a human to map franchise hierarchy, migrate data, and train staff. The product's **franchise multi-tenancy + cross-outlet roll-up** is the differentiator the AE sells. Hire the first BDR only when SCALE MRR > R500k (≈ Y2), as the CTO memo recommends — earlier is premature.

#### G. Content / education (YouTube, multilingual how-to, PR)

- **Target persona:** All tiers; especially first-time digital adopters who need to *see* it work in their language.
- **Estimated CAC:** **R150–R900** amortised; strong assist-rate (raises conversion of every other channel).
- **Payback:** <2 months once a library exists.
- **Why it fits:** "How a Soweto salon cut no-shows 41% with WhatsApp" in zu/xh/af is both top-of-funnel *and* an activation aid. Content is the connective tissue between community trust and paid scale, and the raw material for category-creation PR (MyBroadband, ITWeb, Ventureburn, Disrupt Africa, TechCentral).

### 1.4 Blended CAC trajectory

| | Y1 | Y2 | Y3 |
|---|---|---|---|
| Channel mix (paid / organic+community / partnership) | 50 / 35 / 15 | 45 / 30 / 25 | 40 / 25 / 35 |
| **Blended tenant CAC (ZAR)** | **R650** | **R520** | **R430** |
| Driver of decline | Community + referral ramp | Partnership rev-share scales | FMCG/franchise distribution |

---

## 2. The FREE-tier wedge & PLG motion

### 2.1 How FREE functions as top-of-funnel

The FREE tier (500 members, 1 staff seat, 200 AI replies/mo) is **not a trial — it is the distribution weapon.** It does three jobs:

1. **Zero-friction land for spazas and single-store owners** who have never paid for software. WTP in the informal sector is R0; FREE meets it.
2. **Consumer-acquisition engine:** every free business that puts up a QR table-talker enrolls members who install the PWA — seeding the network effect at no media cost.
3. **Data + relationship beachhead:** once a business's catalog/FAQ is in the per-tenant RAG and its members are in the wallet, switching cost and upgrade pull both compound (CTO memo §3.2 switching-cost moat).

**Guardrail (from the CTO memo, endorsed):** *never degrade FREE into a 14-day trial.* The R0 wedge is the sharpest distribution asset in the product.

### 2.2 Activation milestones & the "aha" moment

| Milestone | Event (telemetry) | Why it matters |
|---|---|---|
| Account created | onboarding_completed | Necessary, not sufficient |
| First reward configured | (instrument) | Setup intent |
| **First member joined via QR/WhatsApp** | `membership.joined` | **Activation threshold** |
| **First points redeemed by a real customer** | `points_redeemed` | **The "aha" — the owner watches a customer come back and redeem** |
| First AI co-worker answer grounded in own catalog | `ai_message_sent` (grounded=true) | Unlocks Growth ARPU |

The **aha moment is the first redemption**: the owner sees a repeat customer pulled back by points delivered in WhatsApp. North-star activation metric: **% of new free tenants reaching first redemption within 14 days.** Target 35% by Q4. Everything in onboarding should compress time-to-first-redemption.

### 2.3 Conversion mechanics FREE → STARTER → GROWTH

Upgrade pull comes from **quota walls** that `checkPlanLimit()` already enforces, surfaced as contextual prompts:

| Trigger (quota hit) | From → To | In-product prompt |
|---|---|---|
| 500-member cap reached | FREE → STARTER | "You've hit 500 members — your loyalty is working. Unlock 3,000 members for R499/mo." |
| Needs 2nd/3rd staff seat | FREE → STARTER | "Add your team — Starter includes 3 seats." |
| 200 AI replies exhausted | FREE → STARTER | "Your AI co-worker answered 200 questions this month. Get 1,500 on Starter." |
| Wants WhatsApp broadcast templates | FREE → STARTER | "Send promotions to all your customers — 1,000 WhatsApp templates on Starter." |
| 3,000 members / 1,500 AI / multi-location | STARTER → GROWTH | "Running campaigns across locations? Growth gives 10,000 members + 5,000 AI." |
| 10,000 members / multi-outlet | GROWTH → SCALE | "Managing multiple branches? Scale adds franchise roll-up + 25 seats." |

**PLG mechanics to fund:**
- **Quota-wall prompts** wired to `subscription_upgraded` (the event exists; the UI prompts must be built/instrumented).
- **Lifecycle WhatsApp/email** at 80% of any quota ("you're close to your limit").
- **Annual-plan nudge** at upgrade (2 months free) to lock cash and cut churn.
- **AI quota exhaustion as a soft upgrade signal:** when a tenant repeatedly hits the hard cap, that is a hand-raise — trigger a Starter offer rather than pretending overage billing is live.

**Conversion targets (CTO memo §9.3, endorsed):** free→paid **3% (Q1) → 7% (Q4)**.

---

## 3. Viral & network-effect loops

### 3.1 The loops, mapped to shipped reality

**Loop 1 — Consumer wallet density (SHIPPED, intra-business).**
Customer joins loyalty via WhatsApp/QR → installs PWA → earns/redeems → business sees repeat-visit value. The C2C referral code (`referral.service.ts`) amplifies this *within* a business: a member refers a friend, referrer earns ≥50 points after the friend's first purchase. **Effect:** raises members-per-tenant (network-effect signal target 200→700, CTO §9.3), which raises tenant value and retention. **It does not, by itself, acquire new tenants.**

**Loop 2 — Member-sees-Heita-elsewhere (PARTIALLY SHIPPED, cross-business).**
A consumer who is a member of Business A encounters Heita again at Business B, C, D. Familiarity ("oh, I already have this wallet") lowers consumer-join friction at every *new* business — a genuine cross-side network effect. **The lever to build:** when an *owner* who is also a *consumer* of another Heita business experiences the product as a customer, prompt them to claim a business account ("Run a shop? Get Heita free."). This converts the consumer base into a tenant top-of-funnel — the "member-referral-business" virality the SWOT names.

**Loop 3 — Business → business referral (NOT YET BUILT — fund it).**
Owner of Business A refers Business B; A gets account credit (e.g. R500 / one free month), B gets a free month. This is the loop that **directly lowers tenant CAC** (§1.3-D). The C2C primitives (referral codes, attribution, reward grant) exist and can be generalised to the tenant entity. **This is the single highest-leverage growth build in the first 90 days.**

**Loop 4 — Franchise cross-outlet expansion (SHIPPED topology).**
Parent/child `Business` hierarchy means landing one franchise HQ expands to N outlets with near-zero marginal CAC. Land-and-expand inside a brand is the SCALE-tier flywheel.

### 3.2 Viral coefficient (k) drivers — estimate

k = (invites sent per active tenant) × (conversion per invite). Realistic **tenant-level** estimates:

| Loop | Invites/active tenant/yr | Conv. | k contribution | Status |
|---|---|---|---|---|
| B2B referral (to build) | 1.5 | 12% | **0.18** | Build |
| Member→business spillover | 3.0 | 3% | **0.09** | Partial |
| Franchise expansion | 0.4 (outlets) | 60% | **0.24** | Shipped |
| **Blended tenant k** | | | **~0.30–0.50** | |

A tenant **k ≈ 0.3–0.5 is sub-viral but powerful**: it means **20–35% of tenant growth is organic/free**, directly pulling blended CAC from R650 toward R430 over three years. The *consumer* loop, by contrast, is genuinely viral (k > 1 within a tenant via QR + C2C referral) but monetises only indirectly. **Be honest with the IC: Heita is a network-effect business, not a classic viral-loop business — growth still requires paid + community spend, and the loops bend the CAC curve rather than replace the budget.**

---

## 4. CAC / LTV economics (per ICP tier)

### 4.1 Assumptions (flagged as estimates)

- **Gross margin 84%** blended (CTO memo; COGS ≈ R2.40–R2.88/tenant/mo — WhatsApp/AI/infra). Validated by tier quotas: even SCALE's 25k AI replies at platform-fallback cost stays within an 80%+ margin envelope because usage is hard-capped per tier.
- **Churn (monthly logo):** emerging-market SMB churn is high and must not be sugar-coated. **FREE→paid cohorts churn 3.5–5%/mo; mature paid 2.5–3.5%/mo; SCALE 1.5–2%/mo** (franchise contracts, higher switching cost). The CTO memo's 33% *annual* figure ≈ 3.2%/mo — consistent, used as base case.
- **LTV** = (ARPU × GM) ÷ monthly churn, capped at a 3-year horizon (do not bank infinite-life LTV for an SMB book).
- **CAC** = blended per-tier acquisition cost (community/partnership cheaper, paid social dearer).

### 4.2 Unit economics by tier (base case, mature cohort)

| Metric | STARTER | GROWTH | SCALE |
|---|---|---|---|
| ARPU (ZAR/mo) | 499 | 1,499 | 4,999 |
| Gross margin | 84% | 85% | 86% |
| Monthly GP (ZAR) | 419 | 1,274 | 4,299 |
| Monthly logo churn | 3.5% | 2.8% | 1.8% |
| Avg lifetime (months, capped 36) | 28 | 33 | 36 |
| **LTV (3-yr cap, ZAR)** | **~11,700** | **~36,000*** | **~108,000*** |
| Blended CAC (ZAR) | 600 | 1,400 | 5,500 |
| **LTV : CAC** | **~19×** | **~26×** | **~20×** |
| **GP payback (months)** | **1.4** | **1.1** | **1.3** |

\* GROWTH/SCALE lifetimes hit the 36-month cap; uncapped LTV is higher but is deliberately not banked.

### 4.3 Blended portfolio (matches CTO memo §7.5, validated against real tiers)

| Metric | Y1 | Y2 | Y3 |
|---|---|---|---|
| Paying tenants | 600 | 4,000 | 12,000 |
| Blended ARPU (ZAR/mo) | 700 | 900 | 950 |
| Gross margin | 84% | 86% | 88% |
| Blended CAC (ZAR) | 650 | 520 | 430 |
| Blended 3-yr LTV (ZAR) | ~17,500 | ~22,000 | ~24,500 |
| **Blended LTV : CAC** | **~27×** | **~42×** | **~57×** |
| GP payback (months) | 1.2 | 1.0 | 0.8 |

> **Investor-honesty caveat (critical).** The 27×–57× blended ratios are *cohort-early* and rest on (a) very low SMB software CAC in SA, (b) high gross margin, and (c) a 3-year LTV cap that still flatters because monthly churn is the dominant variable. **At steady state, with mature churn and rising paid-CAC as community/partnership channels saturate, expect blended LTV:CAC to settle at ~6–10×** — still excellent for SMB SaaS, but the headline 30×+ should be presented as the *early-cohort* number with the steady-state range named alongside it. A 0.5–1.5 month payback is the genuinely remarkable figure and the one to underwrite.

### 4.4 The FREE-tier "negative" economics, correctly framed

FREE tenants carry COGS (~R2–R3/mo each, mostly AI/WhatsApp) with R0 revenue. At 5,000 free tenants that's ~R12–15k/mo — trivial, and the correct accounting treatment is **marketing CAC, not COGS**: each free tenant is a cheaply-held option on a future paid conversion plus a consumer-acquisition node. Guard against abuse (AI-reply quota hard caps already do this).

---

## 5. Advertising plan — 18-month phased budget

Aligned to the CTO memo's three financing milestones (M6 / M12 / M18) and the recommended **R20m seed**. Marketing/GTM is ~**R7.2m of the 18-month plan** (the balance funds eng/ops per the memo's use-of-funds).

### 5.1 Phase plan

| Phase | Months | Posture | GTM budget | Tenant target |
|---|---|---|---|---|
| **Phase 1 — SA founder-led** | M0–M6 | Community + content + minimal paid; prove activation & first-redemption | **R1.4m** | 80 → 200 paying |
| **Phase 2 — SA paid scale** | M6–M12 | Paid social + Search + partnerships MOU + B2B referral live | **R3.0m** | 200 → 600 paying |
| **Phase 3 — Africa expansion** | M12–M18 | NG/KE/EG pilots + franchise field sales + FMCG distributor pilot | **R2.8m** | 600 → 1,500 paying |

### 5.2 Budget allocation by channel (18-month, ZAR)

| Channel | Phase 1 | Phase 2 | Phase 3 | Total | % |
|---|---|---|---|---|---|
| Founder/community reps & incentives | 450,000 | 500,000 | 550,000 | 1,500,000 | 21% |
| Paid social (Meta CTWA + IG/TikTok) | 250,000 | 1,100,000 | 750,000 | 2,100,000 | 29% |
| Google Search + SEO | 80,000 | 350,000 | 300,000 | 730,000 | 10% |
| Content/video (multilingual) + PR | 220,000 | 350,000 | 330,000 | 900,000 | 13% |
| Partnerships (co-mktg, rev-share float, MOU) | 100,000 | 350,000 | 500,000 | 950,000 | 13% |
| Referral credits (B2B + C2C subsidy) | 50,000 | 200,000 | 250,000 | 500,000 | 7% |
| Field sales (SCALE) + events | 50,000 | 150,000 | 320,000 | 520,000 | 7% |
| **Total** | **1,200,000*** | **3,000,000** | **3,000,000*** | **7,200,000** | **100%** |

\* Phase 1 holds R200k contingency; Phase 3 holds R200k for expansion-market template/localisation cost.

### 5.3 Creative & messaging angles per persona (SA cultural context, en-ZA/zu/xh/af)

The product ships **4 message catalogs (en-ZA, zu, xh, af)** — marketing creative must match. Lead with **"loyalty wallet"** on cold traffic (tangible, 8-second demo) and **"AI co-worker"** on second touch (unlocks GROWTH ARPU), per the CTO memo's tested split.

| Persona | Lead message | Cultural cue | Sample creative |
|---|---|---|---|
| **Spaza owner (FREE)** | "Your shop, in their pocket — free." | Township familiarity, R0, "no laptop needed" | Reel: owner scans a till slip on a R1,500 phone, points land in customer's WhatsApp. zu VO. |
| **Salon (STARTER)** | "Stop the no-shows. Rebook in WhatsApp." | Stokvel/regular-client culture, rebooking | "How a Soweto salon cut no-shows 41%" testimonial, xh/zu. |
| **Café/restaurant (STARTER/GROWTH)** | "Reward the regulars. Run promos in one tap." | Loadshedding resilience ("runs on 2G") | Owner sends a 2-for-1 broadcast during a quiet hour; queue forms. af + en-ZA. |
| **Boutique (GROWTH)** | "Your AI co-worker knows your stock." | Aspirational, "big-brand tools for your size" | AI answers "do you have size 6 in the red?" from the catalog. en-ZA. |
| **Franchise (SCALE)** | "Every outlet. One dashboard. One brand." | Procurement trust: POPIA-clean, SA-hosted | Case study + ROI calculator; LinkedIn/field. |

**Sample campaign concepts:**
1. **"Heita, Sawubona, Molo"** — multilingual brand launch; the greeting *is* the brand; one hero film cut into zu/xh/af/en-ZA, CTWA into a live demo bot.
2. **"Till Slip Challenge"** — UGC: shop owners film themselves scanning a paper slip → points in WhatsApp in <10s. TikTok/IG, hashtag, partner-amplified.
3. **"R0 December"** — seasonal push aligned to township retail's peak (festive + stokvel payouts); free-tier land + Starter upgrade offer in January.
4. **"Loadshedding-proof loyalty"** — PWA-on-2G angle; the trust signal that no global SaaS can claim.

### 5.4 Expected outcomes vs spend

At R7.2m GTM over 18 months and a declining blended CAC (R650→R520→R430), the budget supports **~1,500 paying tenants by M18** with paid contributing ~50% and community/partnership/referral the rest — consistent with the CTO memo's milestone-3 gate (1,500 paying, ~R13m ARR).

---

## 6. Marketing strategy & brand

### 6.1 Positioning statement

> **For** South African and emerging-market retailers, salons, restaurants and small franchises **who** lose repeat customers to paper loyalty cards, WhatsApp-group chaos and Instagram DMs, **Heita is** a WhatsApp-native loyalty wallet *and* per-business AI co-worker in one PWA **that** runs on a R1,500 phone over a 2G signal, talks to customers in their language, and keeps your business memory — **unlike** global CRMs (USD-priced, overseas-hosted) and bare WhatsApp tools (no loyalty, no memory), **Heita is** POPIA-clean, ZAR-priced, and born inside WhatsApp.

### 6.2 Key messages (priority order)

1. **WhatsApp-native, not WhatsApp-bolted-on.** Every customer action in their existing thread, their number, their language.
2. **An AI co-worker that knows *your* shop** — your prices, your stock, your FAQs — not a generic chatbot.
3. **Runs on 2G, POPIA-clean, ZAR-priced.** Built for here, not ported from elsewhere.
4. **Start free.** No laptop, no card machine, no risk.

### 6.3 Content strategy

- **Pillar:** "Repeat customers, not just first-time customers." Every asset ladders to retention/repeat-visit ROI.
- **Formats:** 8-second demo Reels (loyalty wallet), multilingual YouTube how-tos (zu/xh/af), owner-testimonial case studies with hard numbers (no-show %, repeat-visit lift), and a comparison/SEO hub ("Heita vs paper cards", "Heita vs Smile.io for SA").
- **Cadence:** 3 short-form/week, 1 testimonial/2 weeks, 1 PR placement/month.

### 6.4 Community strategy

- **Anchor in existing trust networks:** township business chambers, NASASA/stokvel federations, spaza co-ops, salon/restaurant WhatsApp groups, SMME Facebook communities.
- **Community reps as the Phase-1 growth team** (see §1.3-A) — sign the chairperson/anchor business first, let the cascade run.
- **Heita Champions:** power-user owners who host local demos for data-bundle incentives — turns activation into a community ritual and feeds testimonials.

### 6.5 Partnership-led GTM

Sequence: **payment rail MOU (M9, Yoco/PayFast/Stitch) → telco business co-marketing (M12) → FMCG distributor spaza pilot (M12) → franchise HQ land-and-expand (M12+).** Each partner brings pre-aggregated, high-trust distribution at R50–R400 CAC. Multi-partner from day one to avoid single-partner dependency (CTO §7.7 risk 5).

### 6.6 PR / category-creation narrative

Heita is a **category-creation play** (CTO §Executive Verdict): own the phrase **"WhatsApp-native loyalty + AI co-worker for emerging-market SMBs."** PR targets: MyBroadband, ITWeb, TechCentral, Ventureburn, Disrupt Africa, The Plug, Daily Maverick (business). Angle: *not* "another CRM" but "the tool that brings township and informal retail into the digital loyalty economy — built locally, POPIA-clean." Tie placements to milestones (first 1,000 businesses, first franchise logo, first partnership).

---

## 7. Go-to-market risks & mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **WhatsApp template-approval tax** — 30+ templates × 4 languages must stay Meta-approved; the biggest operational GTM tax (CTO §1.3). | High | Centralise a template library + approval pipeline; reuse approved templates across tenants; SMS (Africa's Talking) + push + in-app fallback so no campaign is single-channel; budget a part-time "template ops" role. |
| 2 | **Meta dependency / price hike / first-party encroachment** — Meta could ship SMB loyalty in 12–18 months and/or raise CTWA/template pricing. | Existential | Never let WhatsApp exceed ~40% of message volume (multi-channel dispatcher already exists); own the workspace/memory/loyalty-math/franchise layers Meta underbuilds; build owned distribution via partnerships so growth isn't Meta-ad-dependent. |
| 3 | **Low informal-sector WTP** — spaza ARPU is R0; free→paid may stall below 7%. | High | FREE-as-CAC accounting; community-led upgrade nudges; annual 2-month-free cash lock; airtime/EFT/Yoco payment options; STARTER held at R499 (sub-R500 psychological floor). |
| 4 | **Multilingual support cost** — 4 languages across content, templates, and CS. | Medium | Lean on the shipped 4-catalog i18n; AI co-worker deflects tier-1 support in-language; community Champions provide peer support; concentrate live CS on GROWTH/SCALE. |
| 5 | **Distribution in low-trust markets** — cold digital ads under-convert where trust is relationship-based. | High | Lead with community/partnership (trusted intermediary signs first); testimonial-heavy creative in-language; "start free" removes financial risk; CTWA routes to a live demo, not a form. |
| 6 | **Paid-social click fraud / low lead quality (SA)** | Medium | Meta CAPI + server-side events; double-confirm OTP signup (shipped); lead-quality scoring; weekly CAC reallocation; judge channels on *paid-tenant* CAC, not free signups. |
| 7 | **Single-partner dependency (Yoco/bank pulls out)** | Medium | Multi-partner pipeline from day one (FNB/Absa/Capitec/PayFast/Stitch/Peach); rev-share, not exclusivity. |
| 8 | **AI/Anthropic cost spike erodes margin on heavy free use** | Medium | Ollama-first fallback; strict quota caps exposure; per-tenant token accounting (shipped); price so demand self-limits. |

### 7.1 Milestone alignment (what an investor underwrites)

| Gate | Timing | GTM proof point | Underwrites |
|---|---|---|---|
| **M6** | Dec 2026 | 200 paying; first-redemption activation ≥35%; community engine proven; CAC dashboard live (named per-channel CAC) | Seed deployment is working |
| **M12** | Jun 2027 | 600 paying (~R5m ARR); payment-rail MOU signed; B2B referral loop live; free→paid ≥7% | Series-A readiness |
| **M18** | Dec 2027 | 1,500 paying (~R13m ARR); Africa pilots; first franchise SCALE logo; FMCG distributor pilot | Series-A raise |

**The non-negotiable instrumentation ask (CTO §9.1.4):** a **named, per-channel CAC / LTV:CAC / payback dashboard by M3.** The telemetry contract (`telemetry-events.ts`) already defines the funnel events; the gap is wiring PostHog end-to-end (CTO critical-fix #4). Without it, every number in this section is a forecast rather than a fact — fund the wire-up first.

---

*— Senior Growth/GTM Advisory · Confidential · Section 3 of the Heita investment memorandum · June 2026*
