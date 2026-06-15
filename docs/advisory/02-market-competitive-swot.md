# Heita CRM — Market, Competitive Landscape, Moat & SWOT

*Prepared: June 2026 · Author: Senior Market Strategist · Status: Investment memorandum section · Companion to `CTO_ADVISORY_INVESTMENT_MEMO.txt`*

> **Grounding note.** This analysis is grounded in what actually ships per `src/lib/billing.ts`, `README.md`, `CLAUDE.md`, and the existing CTO memo. Where I cite external market data it is flagged as an **[estimate]** with reasoning, because primary sources are noisy and regionally inconsistent. Where the existing memo is over-optimistic I flag it explicitly under **[Memo correction]**.

---

## 0. What actually ships (the floor for every claim below)

Confirmed from code, not from the memo's prose:

- **Pricing (from `src/lib/billing.ts`):** FREE (R0), STARTER (R499/mo, R4,990/yr), GROWTH (R1,499/mo, R14,990/yr), SCALE (R4,999/mo, R49,990/yr). **Four tiers, already shipped** — the memo's §7.2 "recommendation to add STARTER" is stale; STARTER ships. The R0→R499 step is a far gentler cliff than the R0→R1,499 the memo worried about.
- **Quotas:** FREE = 500 members / 1 seat / 200 AI msgs. STARTER = 3,000 / 3 seats / 1,500 AI / 1,000 WA templates. GROWTH = 10,000 / 5 seats (+R149) / 5,000 AI / 3,000 WA templates. SCALE = 100k soft-cap / 25 seats (+R99) / 25,000 AI / 20,000 WA templates. **The R0.20/msg AI overage price exists in plan metadata, but the live code currently enforces a hard cap rather than billing overage traffic.**
- **Channels:** WhatsApp Cloud API (HMAC webhook) primary; SMS (Africa's Talking), email, push, in-app via notification dispatcher with quiet-hours + opt-in. WhatsApp send is gated on channel opt-in (defaults **off**), marketing consent, verified E.164, and a configured `wabaPhoneId`.
- **AI:** model-agnostic BYOM (Anthropic / OpenAI / Gemini / DeepSeek / others) with Ollama → platform Anthropic fallback; per-tenant pgvector(1024) RAG, hybrid FTS+vector, reranker, SSRF-guarded web-source crawl.
- **OCR:** client-side Tesseract.js in-browser, DeepSeek vision server fallback.
- **Multi-tenant / franchise:** `businessId` row-scoping with Postgres FORCE RLS architecture, a two-role DB model, static-analysis CI, and a live RLS smoke test in CI. The remaining gap is full app-role rollout under `heita_app`, not absence of RLS.
- **Payments:** Yoco / PayFast / Stripe provider registry. **Heita is not a payment processor** — it sits beside the rails.

This floor matters: most competitive "wins" below are bundle wins, not single-feature wins. No individual capability here is novel; the **integration** is.

---

## 1. Target Market & ICP

### 1.1 The five ICP personas — validated and re-graded

The memo's five personas are directionally right but the **monetizability grading is too generous at the bottom and the LTV ordering understates the franchise tail**. Re-graded:

| # | Persona | Realistic plan | True monetizability | Strategist note |
|---|---|---|---|---|
| 1 | Spaza / corner shop | FREE (rarely converts) | **Very low.** Cash economy, prepaid airtime, R2.88–R34/GB data sensitivity, <R40k turnover. | **[Memo correction]** The memo treats spazas as "top of funnel." Honest read: the spaza is a *brand-awareness and PR asset*, not a funnel. Conversion to paid is near-zero. Do not size SAM on spazas. |
| 2 | Hair / beauty / nail salon | STARTER (R499) | **Strong.** Appointment-driven, rebooking pain, owner has a smartphone, values no-show reduction. | The sharpest STARTER wedge. WhatsApp reminders + loyalty map perfectly to the no-show problem. |
| 3 | Independent restaurant / café | STARTER→GROWTH | **Strong.** R200k–R1.5m turnover, promo-driven, repeat-visit economics. | Vertical pack upsell lives here. |
| 4 | Fashion / footwear boutique (1–4 stores) | GROWTH (R1,499) | **Moderate–strong.** Higher basket, catalog-heavy → RAG shines. | Catalog depth is where per-tenant RAG earns its keep. |
| 5 | Small franchise / multi-store (5–30) | SCALE (R4,999) | **Strongest LTV, lowest volume.** Franchise hierarchy + roll-up is the genuine differentiator. | **This should be persona #1 by strategic value, not #5.** It is the only segment where the moat (franchise topology) is structural rather than feature-level. Land-and-expand: one franchise HQ = 5–30 outlets. |

**Strategic re-ordering:** by *defensibility-weighted LTV*, the priority is **5 > 2 > 3 > 4 > 1**, not the memo's 1→5. The free spaza tier is a distribution/PR weapon; the franchise tier is the moat-bearing revenue.

### 1.2 ICP that the memo omits

- **B2B SMB suppliers / wholesalers** doing WhatsApp order-taking (very common in SA/Nigeria). Pipeline + outbound documents (quotes/invoices) already ship — this is an under-marketed ICP.
- **Gyms / fitness studios / driving schools** — recurring-membership + reminder economics identical to salons.

### 1.3 TAM / SAM / SOM — re-grounded

External data points (all **[estimate]**, sourced below):
- SA SMMEs: ~2.5–3.1m total; informal economy ~R750bn, ~19.5% of employment (StatsSA Q4 2024). Spaza segment alone ~100k+ outlets, R150–200bn/yr — but **largely unmonetizable as SaaS**.
- WhatsApp penetration SA: **~96% of internet users**, ~28m users by 2026. This is the single strongest tailwind and it is real.
- Smartphone penetration Sub-Saharan Africa: ~75% by 2025 **[estimate]**. Data cost SA avg ~R34/GB, floor R2.88/GB — the PWA-on-low-data thesis holds.

**Re-graded sizing (SA only):**

| Layer | Memo figure | Strategist re-grade | Reasoning |
|---|---|---|---|
| **TAM** | R11.2bn (3.1m SMMEs × R300/mo) | **R4.5–6bn realistic** | The R300 avg WTP blends in 2.5m+ informal firms that will never pay. Strip those: ~250–400k addressable formal SMBs × R400–500 realistic ARPU ≈ R1.2–2.4bn *serviceable revenue*; the R11.2bn "TAM" is a theoretical ceiling, not a market. **[Memo over-optimistic.]** |
| **SAM** | R3.0bn (250k firms) | **R1.2–1.8bn** | 250k formal, in-vertical, Meta-reachable firms is plausible. But blended realistic ARPU is ~R500–600 (STARTER-heavy mix), not the implied R1,000. |
| **SOM Y1** | 600 paying / R5m ARR | **300–500 paying / R2.5–3.5m** | Founder-led GTM in a recessionary SA SMB market; 600 by M12 is aggressive but not impossible with a partnership channel. |
| **SOM Y3** | 13,500 / R154m | **4,000–7,000 / R45–70m** | The memo's Y3 assumes multi-region GTM firing on all cylinders. More realistic: SA dominant, NG/KE pilots only. |

**Global roll-up:** the memo's 9.2m SAM / 92k Y5 paying / $1.1bn ceiling is an *upside narrative*, not a plan. The memo itself concedes "realistic Y5 is $60–90m ARR" — agreed, and even that requires winning two of {SA, Brazil, India} convincingly. **The honest planning number is SA-led $30–60m ARR by Y5.**

### 1.4 The informal-sector honesty paragraph

The single most important market-realism statement: **WhatsApp penetration ≠ SaaS willingness-to-pay.** A 96% WhatsApp number creates a *reachability* moat (you can talk to anyone) but not a *monetization* base (most can't/won't pay R499/mo). Heita monetizes the **formal long tail** — the salon, the boutique, the café, the franchise — and uses the informal tier (FREE) as acquisition surface and consumer-wallet network seeding. Sizing must be built bottom-up from the ~250–400k formal addressable firms, never top-down from 3.1m SMMEs.

---

## 2. Moat Analysis

Rated weak / moderate / strong, with durability windows.

| # | Moat element | Rating | Reasoning | Durability |
|---|---|---|---|---|
| 1 | **WhatsApp-native integration depth** | **Moderate** (memo says strong) | Every BSP (Wati, Respond, SleekFlow, Take Blip, Gupshup) is also "WhatsApp-native." Heita's edge is *born-inside-WhatsApp for the SMB loyalty use case*, not WhatsApp integration per se. The API is a commodity; Meta gates the relationship. **[Memo over-rates this.]** | 12–18 mo |
| 2 | **Per-tenant RAG / institutional memory** | **Strong** | This is the deepest moat. A tenant's embedded catalog, FAQ, return-policy, stock, and conversation history compound monotonically with tenure. Switching = abandoning the trained co-worker. Genuinely hard to copy *at the SMB price point* because incumbents bolt a generic LLM on, not per-tenant grounded RAG. | 18–30 mo |
| 3 | **Multi-tenant franchise roll-up** | **Strong (structural)** | The single most defensible *structural* asset. Parent/child Business + cross-outlet loyalty + HQ roll-up + `FRANCHISE_ADMIN` role. Once a franchise brand standardises, displacement = re-onboarding every outlet + retraining staff. No sub-R5k/mo competitor does this. | 24–36 mo |
| 4 | **PWA + on-device OCR + WhatsApp re-engagement loop** | **Moderate** | The *experience* moat customers feel. Each piece is copyable (Tesseract.js is open source; PWAs are standard) but the **closed loop** (paper receipt → points → PWA wallet → WhatsApp re-engagement) on a 10MB data budget is rare. Defensible by craft, not by IP. | 12–18 mo |
| 5 | **POPIA / data-residency / local-rails regulatory moat** | **Moderate (real but narrow)** | Real for *enterprise/franchise procurement* (where is the data?) and ZAR billing. **But:** it protects the SCALE tier, not the long tail; and global players can spin up af-south-1 regions. It's a *sales-cycle advantage*, not a permanent moat. **[Memo over-rates as a top-tier moat.]** | 18–36 mo (erodes as global players localise) |
| 6 | **Network effects** | **Weak–moderate** | The "member-referral-business" cross-side effect (members of one Heita business discover another) is real in theory but unproven and slow. Consumer wallet adoption must reach density first. Not a moat yet — an aspiration. | N/A until density |
| 7 | **Switching costs** | **Strong (compounding)** | Driven by #2 (RAG memory) + #3 (franchise topology) + loyalty point liabilities (members hold balances — you can't casually migrate off a platform holding your customers' points). Loyalty liability is an underrated lock-in. | 24–36 mo |
| 8 | **Data moat** | **Moderate** | Per-tenant data is siloed (correctly, for POPIA) which *limits* a cross-tenant data flywheel. Aggregate benchmarking ("salons like you see 41% rebook") is a future data product, not shipped. | Latent |

**Composite durability verdict:** the *combination* (RAG memory + franchise topology + loyalty-liability lock-in) gives a realistic **18–24 month defensible window** before a well-funded incumbent could replicate the bundle — consistent with the memo, but the durability comes from moats #2/#3/#7, **not** from WhatsApp-nativeness (#1) or POPIA (#5), which the memo over-weights. **The sharpest single moat is per-tenant RAG institutional memory (#2), amplified by franchise switching cost (#3+#7).**

---

## 3. Competitor Analysis by Region

Framing used throughout: **WIN** (Heita beats on bundle/price/fit), **LOSE** (competitor beats on depth/scale/price), **DIFFERENT LANE** (non-overlap — serves another tier/use-case).

### 3.1 South Africa (home market)

| Competitor | Positioning | Pricing | vs Heita | Verdict |
|---|---|---|---|---|
| **Yoco** | SME payments leader; 200k+ merchants, R34bn+/yr processed, R1.7bn raised. Adding lending, business software, basic loyalty roadmap. | 2.6–2.95% txn | Payments-led, not loyalty/CRM-led. Loyalty is roadmap, not shipped. **Heita WINS on loyalty+AI+franchise; LOSES on distribution (200k merchants) and payment-nativeness.** | **Threat (latent) + partner candidate.** Biggest SA risk if they bundle loyalty+WhatsApp into the Yoco app. |
| **Social Places** | Multi-location brand listings, reviews, social management for franchises/QSR. | Enterprise/custom | Overlaps on franchise/multi-location but in *marketing/listings*, not loyalty+AI+WhatsApp CRM. | **Partial overlap / different lane.** Could collide at the SCALE tier. |
| **LoyaltyPlus** | Enterprise loyalty (airlines, large retail). | Enterprise | Big-enterprise loyalty; nowhere near R499–R4,999 SMB tier. | **Different lane.** |
| **SnapScan / Ozow / PayFast** | QR / EFT payment rails. | Txn fees | Pure payments. Heita integrates PayFast; complementary. | **Non-overlap (rail).** |
| **iKhokha (Nedbank-acquired)** | SME payments + card readers, bank-backed. | Txn/hardware | Same latent threat shape as Yoco — bank could bundle loyalty. | **Threat (latent).** |
| **Local loyalty apps (Snapn'Save, Pick n Pay Smart Shopper-type)** | Retailer-specific or coupon apps. | Free/retailer-funded | Single-brand or coupon, not multi-tenant SMB SaaS. | **Different lane.** |

**SA read:** white space is genuinely open. The only real SMB-tier collision risk is **a payments incumbent (Yoco/iKhokha) bundling loyalty+WhatsApp into an existing 200k-merchant base.** Heita's defense: ship franchise + RAG depth and partner with one rail before they build.

### 3.2 Rest of Africa (Nigeria / Kenya / Egypt)

| Competitor | Positioning | vs Heita | Verdict |
|---|---|---|---|
| **Paystack (NG, 60k+ businesses)** | Payments + WhatsApp order links. | Payments rail; pairs with WA commerce. | **Non-overlap / partner.** |
| **Flutterwave** | Pan-African payments, SME lending, virtual cards. | Rail, not loyalty/CRM. | **Non-overlap / partner.** |
| **Moniepoint** | 800m+ txns/mo, profitable, expanding to Kenya. | Payments/banking. | **Non-overlap (latent bundler).** |
| **Local WhatsApp commerce tools / BSPs (e.g. Wati resellers, regional)** | WA broadcast/catalog. | No loyalty, no per-tenant RAG, no franchise. | **WIN on bundle** if Heita localises payments (Paystack/Flutterwave) + templates. |

**Africa read:** no integrated WhatsApp-loyalty-AI SMB CRM incumbent. The barrier is **distribution and local payment rails**, not competition. Heita's product maps 1:1; the GTM cost (BSP status per country, template approval per language, local rail integration) is the gate. **Threat level: low (competitive), high (execution).**

### 3.3 Asia (India / Indonesia / SEA)

| Competitor | Positioning | Pricing | vs Heita | Verdict |
|---|---|---|---|---|
| **Gupshup** | Scale BSP, ~$340m+ raised, 10bn+ msgs/mo. | Enterprise + PAYG | Messaging infra at scale; no SMB loyalty/franchise. | **Different lane (infra).** |
| **Wati** | SMB WhatsApp CRM/shared-inbox. ~$23m raised. | ₹999 PAYG → ₹2,199 (~R460) → ₹4,899 → ₹14,799/mo | Closest *shape*; **no loyalty, no per-tenant RAG, no franchise, no OCR, no PWA wallet.** | **Heita WINS on bundle; LOSES on price + distribution in India.** |
| **AiSensy** | Ultra-low-cost SMB WA marketing. | ₹999–₹1,500/mo (~R210–R320) | **3–5× cheaper than GROWTH on bare messaging.** No loyalty/RAG/franchise. | **LOSE on price for messaging-only buyers; WIN if bundle is valued.** |
| **Interakt** | Shopify-adjacent WA commerce. | ₹2,142+/mo | Commerce-led, no loyalty/franchise/RAG. | **Partial overlap.** |
| **Capillary** | Enterprise loyalty (Asia/ME). | Enterprise | Big-enterprise loyalty; not SMB. | **Different lane.** |
| **Haptik / Freshchat / MoEngage / Zoho** | Enterprise conversational AI / engagement / CRM suite. | Enterprise/SMB | Broader suites; no WhatsApp-loyalty-franchise-OCR bundle at price. | **Different lane / partial.** |
| **East Asia (WeChat/LINE/Kakao ecosystems — Weimob, Youzan, Channel Talk)** | Closed super-app commerce. | — | **WhatsApp-first is non-addressable in CN/JP/KR.** | **Non-addressable.** |

**Asia read:** India is the hardest market on earth for this product. The price anchor (AiSensy ₹999) makes Heita's R1,499 GROWTH look 3–5× expensive *for messaging*. **Heita can only win India on the bundle narrative (AI co-worker + loyalty + franchise as one product), and only with a local price tier.** Recommend: do **not** lead global expansion with India. SEA (SleekFlow look-alike market) and Brazil are softer entries.

### 3.4 Europe

| Competitor | Positioning | Pricing | vs Heita | Verdict |
|---|---|---|---|---|
| **SleekFlow (SG/HK, EU presence)** | AI omnichannel commerce CRM, 2,000+ enterprises, 70+ countries, $23.5m raised. | ~$349/mo Premium + $15/WA number | **Closest architectural look-alike.** No tiered loyalty wallet, no on-device OCR, no franchise roll-up, no PWA consumer wallet. | **Heita WINS on loyalty+OCR+franchise; LOSES on funding, multi-channel breadth, enterprise logos.** |
| **Respond.io** | WA-first omnichannel inbox, no API markup. | Mid-market SaaS | Inbox/automation, no loyalty/franchise/RAG-per-tenant. | **Partial overlap / different lane.** |
| **charles (DE)** | WhatsApp commerce + journeys for retail/DTC. | Mid-market | Commerce journeys, no loyalty wallet/OCR/franchise. | **Partial overlap.** |
| **Bird (ex-MessageBird) / Trengo / Brevo (FR)** | CPaaS / omnichannel marketing suites. | SMB→enterprise | Broad suites; Brevo is closest (marketing+WA+loyalty) but no PWA/RAG/OCR/franchise. | **Different lane / partial.** |

**Europe read:** crowded, well-funded, GDPR-heavy, no WhatsApp-loyalty-OCR-franchise bundle. Entry blockers are severe (Meta BSP status, Schrems II data residency, GDPR CMP, EU template libraries per language, SEPA/iDEAL/Bancontact rails, VAT, field sales). **Verdict: partner/white-label the OCR+loyalty bundle into an existing BSP's EU base; do not cold-start.** Lowest-priority region.

### 3.5 South America (Brazil / Mexico)

| Competitor | Positioning | vs Heita | Verdict |
|---|---|---|---|
| **Take Blip (BR)** | Dominant conversational platform, enterprise-scale (the "LATAM Gupshup"), Warburg Pincus-backed. | Enterprise infra; no SMB loyalty/franchise wallet. | **Different lane (infra) / latent threat.** |
| **Zenvia (BR)** | Omnichannel customer cloud; **funding-constrained** (founder bridged a funding gap). | Broad suite; no loyalty wallet/OCR/franchise. | **Partial overlap; weakened by capital position.** |
| **Nuvemshop (BR/AR)** | E-commerce store builder, 130k+ stores, peak $3.1bn val. | E-commerce, not physical-retail loyalty CRM. | **Different lane (pivot threat).** Most direct threat if it pivots to physical-retail CRM. |
| **Aivo / local WA CRMs** | Conversational AI / support. | No loyalty/franchise bundle. | **Partial.** |
| **Mercado Pago** | Super-app payments distribution. | Rail + distribution; could roll free merchant tools. | **Latent threat (distribution).** |

**LATAM read:** Brazil is WhatsApp-commerce central (~96% penetration). White space = **non-Mercado-Pago brick-and-mortar SMBs needing WhatsApp + loyalty + free tier** — the closest analog to Heita's SA profile. **This is the strongest *expansion* market** (closer to SA's profile than India). Threats are distribution-led (Mercado Pago, Nuvemshop pivot), not feature-led.

### 3.6 North America

| Competitor | Positioning | vs Heita | Verdict |
|---|---|---|---|
| **HubSpot / Salesforce / Square Loyalty / Thanx / Yotpo / Twilio** | SMB-to-enterprise CRM, loyalty, CPaaS — **all SMS/email-native, USD-billed, US-data-resident, mostly non-WhatsApp-native.** | Different channel paradigm, different tier, different geography. | **Different lane (entirely).** |

**NA read:** WhatsApp is not the dominant SMB channel; SMS/email is. These are **non-overlapping** — different channel, currency, data-residency regime, and price tier. NA is not a market for Heita; it is, at most, an *acquirer pool* (HubSpot/Salesforce/Square/Twilio as exit candidates).

### 3.7 Cross-region "bundle" verdict

| | SA | Africa | Asia | Europe | LATAM | NA |
|---|---|---|---|---|---|---|
| Heita wins on... | bundle + POPIA + local fit | bundle (1:1 fit) | bundle narrative only | OCR+loyalty+franchise | bundle + free-tier fit | — |
| Heita loses on... | payments distribution (Yoco) | distribution/rails | **price** (AiSensy) + scale | funding + breadth + entry cost | distribution (Mercado Pago) | channel/currency/tier (N/A) |
| Lane | **home** | **expansion (exec-gated)** | hard / price-gated | partner-only | **best expansion fit** | acquirer pool |

---

## 4. SWOT (specific, code- and market-grounded)

| | **Positive** | **Negative** |
|---|---|---|
| **Internal** | **Strengths** | **Weaknesses** |
| | • Four-tier ZAR pricing **ships today** (FREE/R499/R1,499/R4,999) — gentle R0→R499 cliff, local-rails billing (Yoco/PayFast/Stripe). | • **Tenant isolation rests on a static-analysis grep, not Postgres RLS.** One forgotten `where` clause leaks a tenant. This is a code-confirmed, Series-A-blocking gap. |
| | • Per-tenant RAG (pgvector 1024, hybrid FTS+vector, reranker) = the deepest moat; institutional memory compounds with tenure. | • Single-/small-team build signal (961-line services, 1,046-line schema). Bus-factor risk for diligence. |
| | • Model-agnostic BYOM (Anthropic/OpenAI/Gemini/DeepSeek/Ollama) — de-risks the single-vendor AI cost spike the memo flags as a kill condition. | • **No native POS integration** despite homepage implying "no POS plug-ins" as a feature; SCALE franchises will ask for batch till-slip import. OCR is the workaround. |
| | • Franchise hierarchy (parent/child Business, cross-outlet roll-up, `FRANCHISE_ADMIN`) — structurally defensible, no sub-R5k competitor matches it. | • AI token budget is a **metric, not a hard cap** — margin exposure on heavy tenants. |
| | • On-device Tesseract.js OCR + PWA wallet runs on a 10MB data budget — fits the R34/GB SA data reality. | • Staff dashboard offline support is still a **POC/outbox path**, not a full offline-first admin experience; remaining `force-dynamic` pages are now mostly authenticated surfaces rather than the public acquisition funnel. |
| | • Multi-channel fallback (WA→SMS→email→push→in-app) reduces single-channel (Meta) dependency. | • WhatsApp template approval is a per-language, per-template GTM tax (Meta-gated, operationally heavy). |
| **External** | **Opportunities** | **Threats** |
| | • 96% SA WhatsApp penetration = unmatched reachability tailwind; ~28m users by 2026. | • **Meta first-party encroachment** (catalog/payments/Flows/native loyalty+AI for WhatsApp Business) — the single existential risk. |
| | • Franchise land-and-expand: one HQ win = 5–30 outlets; highest-LTV, moat-bearing segment. | • **Yoco/iKhokha bundling loyalty+WhatsApp** into a 200k-merchant base — the biggest *SA-specific* threat. |
| | • LATAM (esp. Brazil) maps 1:1 onto the SA profile (96% WA, brick-and-mortar SMBs, free-tier need). | • **India price floor (AiSensy ₹999)** makes Heita 3–5× expensive for messaging-only buyers; bundle narrative may not translate. |
| | • POPIA/data-residency + ZAR billing wins enterprise/franchise procurement vs USD-billed global SaaS. | • SME cash-flow fragility (recession, loadshedding, ZAR devaluation) hits SMB SaaS retention hardest. |
| | • Underserved empty quadrant: WA × Loyalty × per-tenant AI × PWA × Franchise × ZAR — no competitor occupies it. | • AI hallucination on stock/price → customer-trust incident; needs hard-confirm + confidence floor. |
| | • Partner/white-label OCR+loyalty bundle into existing BSP bases (EU/Asia) instead of cold-starting. | • Fast-followers (SleekFlow, Wati, Take Blip) could ship a wallet layer in ~12 months; Smile.io could add WhatsApp. |

---

## 5. Category Positioning

**This is category creation, not category replacement.** Heita does not displace a single incumbent category — it stitches five adjacent categories (WhatsApp BSP, SMB loyalty, conversational AI, consumer PWA wallet, franchise/multi-location ops) into one product at one SMB price point.

**The empty quadrant Heita owns:**

> **WhatsApp-native × per-tenant-RAG AI × tiered loyalty wallet × PWA + on-device OCR × multi-tenant franchise roll-up × ZAR/local-rails — for the R0–R4,999/mo emerging-market SMB.**

Every competitor occupies a *neighbouring* quadrant:
- WA BSPs (Wati/SleekFlow/Take Blip/Gupshup) = messaging, **no loyalty/franchise**.
- Loyalty specialists (Smile.io/Yotpo/LoyaltyLion) = Shopify/e-commerce, **no WhatsApp/franchise/RAG**, USD-billed.
- CRM suites (HubSpot/Salesforce/Zoho) = horizontal CRM, **non-WhatsApp-native, USD, wrong tier**.
- Payment rails (Yoco/Paystack/Mercado Pago) = transactions, **no loyalty/CRM/AI** (yet).

**Strategic caveat on category creation:** category creation is *expensive* (you must educate the market on a category that doesn't have a search term yet) and *fragile* (the empty quadrant is empty partly because it's hard to monetize, and partly because the obvious owner — Meta or a payments incumbent — hasn't bothered *yet*). The defensibility is the **combination plus the switching cost it creates**, never any single feature. Heita must reach franchise/RAG-driven lock-in before an incumbent decides the quadrant is worth occupying.

---

## Sources (external data, all figures [estimate] unless from primary stats body)

- SA SMME / informal sector: [StatsSA QLFS](https://www.statssa.gov.za/?p=19240), [Financial Mail](https://www.financialmail.businessday.co.za/fm/features/cover-story/2025-08-28-south-africas-informal-economy-is-becoming-a-giant/), [Matriarch](https://www.matriarch.co.za/blog/south-africas-informal-retail-boom/)
- WhatsApp penetration SA: [Statista](https://www.statista.com/topics/9923/social-media-in-south-africa/), [Rasayel](https://learn.rasayel.io/en/blog/whatsapp-user-statistics/)
- Yoco: [Wikipedia](https://en.wikipedia.org/wiki/Yoco), [Today Africa](https://todayafrica.co/inside-yocos-journey/)
- India BSP pricing: [AiSensy](https://m.aisensy.com/blog/whatsapp-api-providers/), [Coding Clave](https://codingclave.com/guides/whatsapp-api-pricing-india-2026-comparison)
- SleekFlow: [Crunchbase](https://www.crunchbase.com/organization/sleekflow), [SleekFlow Help](https://help.sleekflow.io/en_US/whatsapp/pricing)
- Brazil (Take Blip/Zenvia/Nuvemshop): [Message Central](https://www.messagecentral.com/blog/best-whatsapp-business-api-providers-brazil), [Capterra](https://www.capterra.com/p/200367/Blip/)
- Africa payments (Paystack/Flutterwave/Moniepoint): [TechCabal](https://techcabal.com/2025/07/21/the-biggest-fintech-companies-in-nigeria-2025/), [Contrary Research](https://research.contrary.com/company/flutterwave)
- SA data costs: [News24](https://www.news24.com/tech-and-trends/gig-guide-the-countries-with-the-cheapest-and-most-expensive-data-and-how-sa-measures-up-20230927), [ITWeb](https://www.itweb.co.za/article/sa-sits-on-bottom-half-of-cheapest-mobile-data-list/DZQ587V8eG4qzXy2)

---
*— Senior Market Strategist · Confidential · Companion to the CTO Investment Memorandum · June 2026*
