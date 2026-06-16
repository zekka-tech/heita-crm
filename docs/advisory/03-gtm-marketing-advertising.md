# Heita CRM — User-Acquisition, Advertising & Marketing Strategy

*Investment Memorandum · Section 3 of the advisory series · Updated 15 June 2026 · Refreshed 16 June 2026 (telemetry shipped + acquisition-plan ladder) · Author: Senior Growth/GTM Advisor · Status: Pre-investment diligence*

> **Scope note.** This refresh is grounded in the shipped product and current codebase, not aspirational packaging. The live plan ladder in `src/lib/billing.ts` is **FREE / STARTER / GROWTH / SCALE** at **R0 / R499 / R1,499 / R4,999** per month. The public pricing page shows annual prices, but the implemented checkout helpers for Yoco, PayFast, and Stripe currently create **monthly** charges only. The marketing-site pricing CTA is self-serve only for **FREE**; paid CTAs on `src/app/pricing/page.tsx` still route to `sales@heita.co.za`, while the in-dashboard billing surface can run self-serve checkout when payment-provider credentials are configured. The core funnel telemetry contract is now **essentially complete**: `onboarding_completed`, `business_joined`, `membership.joined`, `loyalty.points_redeemed`, `checkout_started`, `subscription_started`, `subscription_upgraded`, `provider_selected`, `first_reward_created`, legacy `ai.message_sent`, and canonical `ai_message_sent` are all emitted today. **As of the 16 June refresh, `first_reward_created` (the activation milestone) and lead-source / UTM campaign attribution on the public join funnel are shipped** (`src/lib/telemetry-events.ts` `buildLeadAttribution`, threaded through `b/[slug]/join`). **The per-channel CAC/LTV cohort dashboard is now also shipped** as a platform-admin in-app surface (`/admin/cac-ltv`): merchant-acquisition attribution is persisted on the `Business` record at onboarding (UTM-derived), spend lands in a new `AdSpend` table, and `src/server/services/acquisition-analytics.service.ts` computes per-channel CAC, LTV (paid-invoice revenue per acquired business), LTV:CAC, and monthly cohorts cross-tenant via `withSystemScope`. Two referral engines now ship: the original **member-to-member** loop inside a business, and a new **business-to-business merchant referral loop** — a referring merchant earns Rand account credit when a business it referred pays its first invoice, auto-applied to the referrer's next checkout across **all three providers (Yoco, Stripe, PayFast)** (`merchant-referral.service` / `merchant-credit.service`, surfaced at `dashboard/[businessId]/settings/referrals`). Referral is a first-class channel in the CAC/LTV dashboard (`/admin/cac-ltv`), with CAC computed from credit actually granted. It is shipped but unproven in-market; treat its CAC impact as a forward lever, not a demonstrated reduction, until cohorts convert.

## 1. Executive View

Heita's strongest acquisition story is not "AI CRM for everyone." It is **mobile-first loyalty and re-engagement for South African merchants who already operate in WhatsApp**. The live wedge is clear: a merchant can launch free, recruit members through QR and WhatsApp-friendly join flows, give customers a reusable wallet across businesses, and re-engage them through in-app, push, email, and WhatsApp channels where permissions exist.

That matters for the investment case. The seed thesis should be underwritten on three measurable questions, not on broad top-down market claims:

1. Can Heita activate newly onboarded merchants into a real customer loop: first member join, first reward setup, and first redemption?
2. Can those activated merchants convert into paid plans at the live price ladder without heavy services overhead?
3. Can partnerships and product-led loops lower merchant CAC faster than pure paid media?

The right posture for mid-2026 is therefore **South Africa first, activation first, evidence first**. The current product is credible for that plan. It is not yet credible to present as a fully self-serve, pan-African PLG machine with proven viral CAC compression.

## 2. What Can Be Sold Today

| Surface | Current state | GTM significance | Important caveat |
|---|---|---|---|
| Free merchant launch | Live | Strong acquisition wedge; lowers trial friction to near zero | Monetization depends on later upgrade and activation, not signup count |
| Public business pages, join flow, shared customer wallet | Live | Tangible consumer-facing proof that is easy to demo in short-form creative | Consumer growth helps merchant retention more than tenant acquisition today |
| Loyalty points, rewards, signup bonus, referral bonus | Live | Clear repeat-visit message for salons, cafés, boutiques, and specialty retail | Referral is customer-to-customer inside a merchant, not business-to-business |
| Promotions, event reminders, notification orchestration | Live | Real retention and reactivation story beyond a static loyalty card | WhatsApp delivery is gated by consent, opt-in, verified phone, configured `wabaPhoneId`, and approved templates |
| AI workspace with Ollama to Anthropic fallback | Live | Good upsell story for Growth and Scale; useful second-touch differentiator | Staff-only, quota-capped, and not the right primary cold-acquisition hook |
| Receipt OCR and batch receipt handling | Live | Useful in low-integration retail environments where POS integration is absent | This is a workaround advantage, not the same as native POS integration |
| Dashboard billing and checkout | Partially live | Enables assisted/self-serve hybrid upgrades inside the product | Public pricing still routes paid plans to sales email; automated checkout is monthly only |
| Annual pricing | Displayed | Helpful future cash-collection and retention lever | Not implemented in checkout logic today |
| B2B merchant referral program | Live (unproven) | Potential structural CAC reducer; credit settles on referred merchant's first paid invoice | Do not yet credit it with measured CAC reduction until referral cohorts convert |
| Per-channel CAC and subscription telemetry | Partial | Enough to begin product activation tracking | Not enough yet for investor-grade CAC/LTV reporting |

The practical implication is simple: **Heita can be marketed today as a free-to-start loyalty and customer re-engagement product with real paid expansion paths, but not yet as a fully polished self-serve SaaS funnel from ad click to annual contract.**

## 3. Commercial Packaging And Pricing Implications

### 3.1 Live plan ladder

| Plan | Monthly price | Current commercial role | Notes |
|---|---|---|---|
| FREE | R0 | Acquisition wedge | Best used to prove activation, not treated as a time-limited trial |
| STARTER | R499 | Core monetization SKU | Most likely first paid plan for single-location merchants |
| GROWTH | R1,499 | Expansion plan | Best for merchants actively using campaigns, support, and AI workspace |
| SCALE | R4,999 | Assisted sale | Multi-location and franchise-oriented motion; not a marketing-site checkout motion |

The **STARTER** tier is the most important paid SKU in the current model. It is the first price point that a real South African SMB can plausibly absorb while still being meaningfully above a symbolic fee. It is also where the product's actual benefits begin to compound: more members, more staff seats, more broadcast capacity, and a materially larger AI allowance.

The **GROWTH** tier is where the platform starts to justify a more explicit operational-software budget. This is where Heita should introduce the AI workspace and campaign orchestration more aggressively in sales and lifecycle messaging.

The **SCALE** tier should be treated as an assisted commercial motion. The product supports it architecturally, but the marketing and upgrade surfaces should not pretend this is a lightweight self-serve plan.

### 3.2 Packaging corrections investors should hear directly

- **Annual billing is packaging intent, not checkout reality.** It appears in plan metadata and on the pricing page, but live checkout helpers still bill monthly.
- **Paid conversion is hybrid, not pure self-serve.** The public marketing site still routes paid users to sales email, while the dashboard can support provider-backed checkout.
- **AI overage should not be sold as a live revenue lever.** The plan metadata contains an overage price, but current quota enforcement still behaves as a hard cap from the user's perspective.

These are not fatal issues. They simply mean the near-term commercial engine is **free launch -> activation -> assisted or in-product paid upgrade**, not an end-to-end polished website checkout motion.

## 4. Acquisition Strategy Grounded In The Shipped Product

### 4.1 ICP priority

The best current-fit merchant profiles are the ones that map directly to what ships now:

1. **Single-location consumer SMBs with repeat traffic**: salons, barbers, cafés, takeaways, boutiques, beauty, and specialty retail.
2. **Operationally hands-on owners** who already rely on WhatsApp, Instagram, or paper loyalty and can see value from QR joins, rewards, promotions, and simple re-engagement.
3. **Small multi-location operators** where Growth or Scale can be sold as a control and consistency layer.

Lower-priority targets today are merchants whose first problem is deep ERP or POS integration. Heita's receipt OCR and batch flows help, but they do not eliminate the integration gap. That means the initial GTM should sell **repeat-customer revenue and customer communication**, not back-office systems replacement.

### 4.2 Channel priority

| Channel | Why it fits the current product | How to use it | Guardrail |
|---|---|---|---|
| Founder-led, community-led, and merchant-network distribution | Trust is high; the product demos well live; free launch removes contract friction | Activate early clusters through chambers, merchant groups, and local power users | Do not scale headcount until activation and paid-conversion cohorts are measured |
| Meta ads that click to WhatsApp | The product is WhatsApp-adjacent and Meta explicitly supports click-to-WhatsApp ads across Facebook and Instagram | Use short demo creative that shows QR join, wallet, reward, or promotion flow | Only scale after attribution is wired and the handoff from ad to demo/chat is measurable |
| Product proof and customer proof loops | Public business pages, wallet, rewards, and live businesses are demonstrable assets | Turn real merchants into case studies, walkthroughs, and ad creative | Do not count customer referrals as tenant-acquisition until B2B referral exists |
| Search and SEO | Captures high-intent demand, especially for merchants already searching for loyalty or WhatsApp CRM tools | Focus on exact pain terms and comparison content | Keep budget modest until conversion from search to activated merchant is proven |
| Partnerships | Can compress CAC structurally and create distribution the product cannot buy efficiently with ads | Prioritize payment rails, merchant ecosystems, and channel partners with SMB reach | Do not model partner volume until one signed, active, measured channel exists |
| Field sales | Needed for Scale, multi-location, and franchise rollouts | Use only for high-value accounts and controlled pilots | Avoid building a large field team before Scale usage and referenceability exist |

### 4.3 Why Meta click-to-WhatsApp matters, but should not dominate the thesis

Meta's official WhatsApp Business materials make two facts particularly relevant to Heita's GTM:

- WhatsApp Business Platform pricing is now **per delivered message**, with pricing varying by recipient market and message category.
- When a customer enters through an **ad that clicks to WhatsApp**, Meta provides a **72-hour window** in which messages are not charged.

That makes click-to-WhatsApp structurally attractive for Heita's top-of-funnel. It reduces landing-page friction, aligns with the product's native operating channel, and can lower the immediate messaging cost of assisted demos and early follow-up. But it should be treated as a **scaling channel**, not the foundation of the seed case. The foundation should still be **merchant activation and partner distribution**, because those are the channels most likely to produce durable CAC efficiency in a relationship-led SMB market.

### 4.4 Internal planning stance on CAC and payback

The prior memo used exact CAC and conversion numbers too aggressively for a product that does not yet have full channel attribution wired. That should be corrected.

The right investor-grade framing is:

- **Community, referral, and partner channels are expected to be cheaper than pure paid media**, but that is still a working assumption until measured on paid-plan cohorts.
- **Meta click-to-WhatsApp is expected to outperform generic landing-page traffic for this product shape**, but the point is channel fit, not a guaranteed CAC figure.
- **Search should be treated as demand capture, not demand creation.** It will likely be smaller-volume and higher-intent than social.
- **Scale-tier sales can justify higher CAC**, but only once referenceability and rollout discipline are proven.

In other words: use **measured cohort payback thresholds** as the operating control, not market-wide CAC folklore.

### 4.5 The acquisition-channel ladder (prioritized by leverage)

The product is integrated and sales-assisted, **not** a self-serve widget — so paid ads alone will not carry it. The plan is layered, ordered by strategic leverage. Tiers A and B carry the seed case; C–E compound it.

**A. Distribution partnerships — highest leverage (closes the C+ distribution gap).**
This is the direct answer to the single biggest weakness: Heita has no proprietary merchant channel, while incumbents (Yoco, iKhokha) do. Rather than out-spend them on ads, *borrow* their distribution.
- **Co-sell / bundle with payments & POS players that lack loyalty+AI**, accounting/SME platforms, and — highest value — **franchise head offices** (one HO deal cascades to many outlets).
- **Agency / BSP reseller channel:** WhatsApp and marketing agencies resell Heita with margin.
- *Guardrail:* do not model partner volume until **one signed, active, measured** channel exists. One real rev-share deal is worth more than ten LOIs.

**B. Franchise / multi-location direct sales — the economic core.**
Outbound to franchise HOs and small chains (≈5–30 outlets). Land the HO, roll to outlets. This is where CAC/LTV is best, churn lowest, and the franchise-aware architecture is a genuine wedge. **Point the sales motion here, not at the lowest-end informal micro-merchant.**

**C. Paid acquisition — for STARTER / GROWTH self-serve funnel (scaling, not foundational).**
- Meta (FB/IG) **click-to-WhatsApp** (best creative fit; 72-hour free window) + Google Search on high-intent SA terms ("loyalty app for my shop", "WhatsApp marketing for restaurants"), geo/category-targeted.
- **Now unblocked by the shipped lead-source attribution + funnel events** — compute true CAC by channel/campaign **before** scaling spend.
- **Optimize to activation events, not signups:** `first_reward_created` and first broadcast are the real "aha," not account creation.

**D. Consumer-side flywheel — compounding, near-zero CAC.**
Every loyalty join / QR scan / referral is merchant-funded acquisition of *consumers*. Surface a discovery layer so consumers pull more merchants onto the platform over time. Referral codes already exist in schema — instrument and push them. (This is the path to an eventual *network* moat, currently graded only a thesis.)

**E. Community & proof — founder-led, trust-driven.**
WhatsApp-commerce / franchise / retail-association presence; published case studies with hard numbers (repeat-visit lift, redemption rates). In a low-trust, relationship-led market, founder-led content and a trusted intermediary signing the anchor merchant convert cheaper than brand ads.

**Governing metric across all tiers:** CAC payback **< 6–9 months on GROWTH/SCALE** (the underwritable steady-state target; the sub-1.5-month early-cohort payback in §6 will regress as cheap channels saturate). Treat FREE/STARTER as funnel, not profit.

| Tier | Channel | Leverage | Role in seed case |
|---|---|---|---|
| A | Payments/POS/franchise-HO partnerships + agency resellers | **Highest** | Closes distribution gap; foundational |
| B | Franchise / multi-location direct sales | **High** | Economic core (best LTV:CAC) |
| C | Meta CTWA + Google Search paid | Medium | Scales single-location self-serve funnel |
| D | Consumer loyalty/referral flywheel | Compounding | Cheap merchant + consumer acquisition; future network moat |
| E | Community, associations, founder-led proof | Medium | Trust + referenceability in a relationship-led market |

### 4.6 Advertising-monetization primitives (build status)

A separate axis from acquiring *merchants* is helping merchants **reach their own markets** — and monetizing that reach. The plan is tiered by feasibility:

- **Tier 1 — owned-audience reach.** **AI campaign-copy generation is shipped** (`ai-ad.service` + `/api/ai/ad-copy`, surfaced on the promotions dashboard): RAG-grounded, channel-tuned (WhatsApp/SMS/email/in-app) ad-copy variants, metered against the business's AI allowance so heavy use drives plan upgrades. The **outbound-message metering foundation is now also shipped** (`message-usage.service`): plan quotas (`maxWaTemplatesPerMonth` / `maxInAppMessagesPerMonth`) are no longer metadata-only — current-month outbound volume is counted per quota group from the `Message` table and surfaced on the billing page, with an `assertOutboundMessageQuota` enforcement primitive ready to wire in. The **reach-pack commerce layer (V1) is now shipped** (`reach-pack.service` + `lib/reach-packs` catalog + `MessagePack` model): purchasable bundles of extra outbound-message volume that raise the *effective* monthly allowance (the meter folds active pack units into each group's limit). V1 payment method is the existing **merchant account-credit ledger** — so referral credit is directly spendable on reach (refer → earn credit → buy reach), reusing that infra with no new external-payment flow. **Activation (now shipped):** (a) send-path **enforcement** is wired into the proactive broadcast path behind the `reachPackEnforcement` feature flag (default **off**, so no behaviour change until a business is opted in) — when on, a broadcast is refused once the effective WhatsApp allowance is used up, prompting a reach-pack purchase; and (b) an in-product **buy button** on the billing page lets merchants buy packs with account credit. **Still deferred:** external one-off **money checkout** for packs (vs credit-only) — the payment-critical generalization of the subscription checkout to one-off purchases — and a precise per-recipient enforcement count (the current gate is coarse: it refuses when already at/over the limit). Pricing/markup is set in the SKU catalog.
- **Tier 2 — discovery marketplace.** Sponsored placements / featured listings in `/discover` and `/categories`, and sponsored "join" offers priced on **CPA (cost-per-join)**. The feed exists; the ad layer and CPA billing do not yet.
- **Tier 3 — cross-merchant audience.** Consented reach across the wallet network (lead-gen / cost-per-acquired-member) + partner co-marketing. Gated on POPIA consent volume and network liquidity; venture-scale prize, deliberately deferred.

**Measurement is already in place:** sponsored channels become new `acquisitionSource` values flowing through the shipped `/admin/cac-ltv` dashboard, so ad products can be priced on measured outcomes (CPA/CPL) rather than impressions. **Guardrails:** POPIA consent gates any cross-merchant reach (sell reach, never data); WhatsApp marketing is template/economics-constrained, so lean ad inventory toward in-app/push/discovery; keep the wallet ad-light to protect the consumer trust that *is* the asset.

## 5. Funnel, Activation, And Measurement

### 5.1 What the codebase actually measures today

| Funnel point | Current state |
|---|---|
| Merchant onboarding completed | Emitted today as `onboarding_completed` |
| Customer joined a business | Emitted today as `membership.joined` |
| Reward or points redemption | Emitted today as `loyalty.points_redeemed` |
| AI workspace engagement | Emitted today as legacy `ai.message_sent` |
| Customer joined a business (`business_joined`) | Emitted today alongside `membership.joined` |
| Paid checkout initiated (`checkout_started`) | Emitted today when an owner starts a paid checkout session |
| Subscription started / upgraded | Emitted today on first paid activation and paid-plan changes |
| AI provider connected (`provider_selected`) | Emitted today when a business connects a BYOM AI provider |
| Canonical `ai_message_sent` | Emitted today alongside legacy `ai.message_sent` |
| First reward published (`first_reward_created`) | **Emitted today** (16 Jun) — fires once when a business creates its first redeemable reward |
| Lead-source / campaign attribution | **Shipped today** (16 Jun) — `utm_source/medium/campaign` captured on the join funnel and attached to `business_joined` / `membership.joined` |

This matters because the **current telemetry is now good enough to assess both product activation and per-channel attribution**; the missing piece is the **per-cohort CAC/LTV dashboard**, not the underlying events. Reliable channel-CAC and upgrade-economics *reporting* remains the immediate build.

### 5.2 The right activation model for Heita

The activation sequence that actually matches the shipped product is:

1. Merchant launches a business.
2. Merchant sets up a reward and basic programme configuration.
3. First customer joins.
4. First customer earns or receives points.
5. First reward is redeemed.
6. Merchant either broadcasts, runs reminders, or uses AI workspace.
7. Merchant upgrades because of real operational usage, not because a sales page convinced them.

The core insight is that **Heita's commercial "aha" is not account creation. It is the first visible repeat-customer loop.** That means GTM should optimize for **first redemption** and **first useful campaign or AI workflow**, not top-of-funnel vanity signup volume.

### 5.3 GTM instrumentation that should be funded immediately

The first GTM engineering workstream should be small, concrete, and non-negotiable:

1. ~~Add explicit `checkout_started`, `provider_selected`, and `first_reward_created` events.~~ **Done** — all three now emitted (`checkout_started` and `provider_selected` on 14 Jun; `first_reward_created` on 16 Jun).
2. ~~Tie lead source and campaign metadata to the onboarding session.~~ **Done (16 Jun)** — `utm_source/medium/campaign` captured on the join funnel via `buildLeadAttribution` and attached to `business_joined` / `membership.joined`. (Still to do: extend the same attribution capture to the merchant `onboard` flow and persist it onto the business record for durable cohorting.)
3. ~~Build a per-channel dashboard that reports activation and paid conversion by cohort.~~ **Done** — shipped as the in-app platform-admin dashboard `/admin/cac-ltv` (per-channel CAC/LTV/ratio + monthly cohorts, computed from `Business.acquisitionSource` + paid invoices + the new `AdSpend` table). Remaining refinement: persist attribution onto more entry surfaces and add a true time-series payback curve.
4. Add richer billing-state context for renewals, downgrades, and assisted-sales attribution.

The events now exist and the **cohort dashboard is wired** (`/admin/cac-ltv`). The remaining honesty caveat is data-completeness, not tooling: CAC is only as good as the `AdSpend` records entered, and attribution currently covers the onboarding and join entry points — so exact figures firm up as spend is logged and attribution coverage widens.

## 6. Marketing Narrative And Creative Direction

### 6.1 Primary positioning

The primary message should lead with the most obvious live value:

> **Bring repeat customers back through WhatsApp and a loyalty wallet your customers actually use.**

That message is better than leading with AI because it is more concrete, more visual, and closer to the shipped day-one value.

### 6.2 Message hierarchy

1. **Repeat customers and promotions first.** Lead with rewards, QR joins, wallet, and simple re-engagement.
2. **Operational simplicity second.** Mobile-first, easy to start, no heavy setup, no laptop-first posture.
3. **AI workspace third.** Present it as an upsell and differentiation layer once the merchant understands the customer-engagement value.
4. **Compliance and reliability as trust layers.** Mention approved-template discipline, permissions, auditing, and channel fallback where relevant.

### 6.3 Creative guidance that matches the codebase

- Use **real product flows** in creative: QR join, public business page, wallet balance, reward redemption, promotion broadcast, and staff dashboard views.
- Build creative in the **shipped locale set**: `en-ZA`, `zu`, `xh`, and `af`.
- Avoid overclaiming WhatsApp automation. The product supports real WhatsApp sends, but only when the business and user meet eligibility rules and approved templates exist.
- Avoid selling annual billing or AI overage economics in front-stage marketing until those surfaces are actually operational.

The marketing discipline here is straightforward: **show the product that exists, not the one that would exist after another quarter of GTM polish.**

## 7. Region Prioritization

### 7.1 South Africa should remain the base case

South Africa is the only region that is fully aligned with the current commercial and product stack:

- Pricing is denominated in **ZAR**.
- The shipped locale catalogs are **South Africa-specific**.
- The public pricing and billing assumptions are tuned around local price points.
- The codebase already includes **Yoco** and **PayFast** payment paths alongside Stripe.
- Africa's Talking publicly prices services for **South Africa** and multiple other African markets, but Heita's commercial packaging and product copy are still clearly SA-first.
- WhatsApp templates in the repo defaults are currently oriented around `en_ZA`.

That does not mean Heita cannot expand. It means **rest-of-Africa should not be part of the core seed underwriting case yet**.

### 7.2 Expansion rule, not expansion fantasy

The correct expansion logic is readiness-led:

1. Prove repeatable South African activation and paid conversion first.
2. Only enter a new market once billing, payout, template operations, support expectations, and local acquisition channels are understood.
3. If a pilot is necessary, treat it as a **single-market learning experiment**, not as evidence of multi-country scale.

The official Africa's Talking pricing footprint is a helpful signal that messaging rails exist across several African markets. It is **not** evidence that Heita's commercial motion is already localized for them. The current product is still best described as **South Africa-native software with some future regional optionality**, not as a regional rollup in active execution.

## 8. Sharpened Investment Case

The investment case improves, not weakens, when it becomes more disciplined.

A credible mid-2026 GTM thesis for Heita is:

- The product already ships a real free-to-paid ladder with meaningful day-one value.
- The merchant pain is concrete: repeat visits, simple offers, wallet-based loyalty, and customer communication.
- The product has genuine upsell layers: campaigns, AI workspace, higher quotas, and multi-location management.
- The best early distribution should be South African community, merchant-network, and partner-led channels, with Meta click-to-WhatsApp used as a scalable accelerator rather than the sole growth engine.
- The biggest short-term unlock is not another feature. It is **measurement and commercial polish**: telemetry, upgrade path clarity, template ops, and B2B referral.

What should be rejected is the weaker version of the story:

- Not "continent-wide virality."
- Not "proven sub-one-month CAC payback" without measured cohorts.
- Not "annual billing is live" when it is still packaging metadata.
- Not "B2B referrals already reduce CAC" — the B2B merchant referral loop is now shipped but its CAC impact is still unproven until referral cohorts convert.

Investors should underwrite **South African merchant activation and disciplined paid conversion**, with partnership leverage as upside. That is a narrower claim than the previous draft made, but it is also materially more credible.

## 9. Immediate GTM Priorities For The Next 180 Days

1. **Finish the paid funnel story.** Either make public paid-plan conversion genuinely self-serve, or present the product honestly as an assisted-upgrade motion.
2. ~~Build the per-channel CAC/LTV cohort dashboard.~~ **Done** — shipped in-app at `/admin/cac-ltv` (platform-admin gated), computing per-channel CAC/LTV/ratio and monthly cohorts from app Postgres (`Business.acquisitionSource` + paid invoices + the new `AdSpend` table) via `withSystemScope`. Next: log real ad spend and widen attribution capture.
3. ~~Build business-to-business referrals.~~ **Shipped** — Rand account-credit loop (`merchant-referral.service` + `merchant-credit.service`, dashboard at `settings/referrals`, share link `/onboard?mref=CODE`). Credit application now works across **all three providers (Yoco, Stripe, PayFast)**, and **referral is a first-class channel in `/admin/cac-ltv`** (CAC from credit granted). The only remaining item is **non-engineering: prove conversion in-market** — referral cohorts must actually convert before the CAC reduction is real.
4. **Create three verticalized proof packs.** Salon/beauty, café/QSR, and boutique/specialty retail should each have their own onboarding, case study, and creative pack.
5. **Operationalize WhatsApp template onboarding.** Merchant setup must include template readiness, permissions, and `wabaPhoneId` completion.
6. **Resolve annual billing presentation.** Either implement it properly or stop leaning on it in front-stage GTM materials.

## Sources And Evidence

### Internal primary sources

- `src/lib/billing.ts` — live plan ladder, quotas, annual-price metadata, overage metadata.
- `src/app/pricing/page.tsx` — public pricing-page presentation and current paid CTA behavior.
- `src/app/dashboard/[businessId]/settings/billing/page.tsx` and `src/components/billing/checkout-button.tsx` — in-product upgrade and checkout posture.
- `src/server/services/payments/yoco.ts`, `src/server/services/payments/payfast.ts`, `src/server/services/payments/stripe.ts` — implemented payment flows; monthly-charge behavior.
- `src/server/services/billing.service.ts` and `src/server/services/ai-usage.service.ts` — effective-plan enforcement, quota behavior, and current AI cap posture.
- `src/lib/telemetry-events.ts`, `src/app/onboard/actions.ts`, `src/server/services/membership.service.ts`, `src/server/services/loyalty.service.ts`, `src/app/api/ai/chat/route.ts` — live versus defined telemetry.
- `src/server/services/referral.service.ts` — current member-level referral implementation.
- `README.md` and `messages/*.json` — WhatsApp template posture and shipped locale set.

### Official and primary external sources

- WhatsApp Business, **Business Platform Pricing**: per-delivered-message pricing, category model, free service window, and 72-hour free window after ads that click to WhatsApp.  
  https://whatsappbusiness.com/products/platform-pricing/
- WhatsApp Business, **Ads that click to WhatsApp**: channel fit for lead generation, sales, and loyalty-oriented conversations across Facebook and Instagram.  
  https://whatsappbusiness.com/products/ads-that-click-to-whatsapp/
- Africa's Talking, **Pricing**: current public pricing surface showing South Africa and multiple other African markets as supported commercial footprints.  
  https://africastalking.com/pricing
- Yoco, **Pricing**: current public SMB pricing page, merchant scale signal, and roadmap positioning around loyalty/multi-location in South Africa.  
  https://www.yoco.com/za/pricing/

*— Senior Growth/GTM Advisory · Confidential · Section 3 of the Heita investment memorandum · 15 June 2026*
