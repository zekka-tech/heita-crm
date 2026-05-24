import Link from "next/link";
import type { Metadata } from "next";
import { Check, MessageSquareQuote, Shield, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { businessPlans, formatPlanLimit, formatZar } from "@/lib/billing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Compare Heita CRM plans for loyalty, messaging, AI workspaces, and customer engagement."
};

const differentiators = [
  {
    title: "WhatsApp-first engagement",
    description:
      "Run loyalty, customer support, and campaign messaging in the channel customers already use.",
    icon: MessageSquareQuote
  },
  {
    title: "Built-in AI workspace",
    description:
      "Train an AI co-worker on your own policies, catalogues, and FAQs without bolting on another product.",
    icon: Sparkles
  },
  {
    title: "Operationally safe by default",
    description:
      "Webhook verification, rate limits, tenant isolation, audit trails, and staged rollouts are baked in.",
    icon: Shield
  }
];

export default function PricingPage() {
  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <section className="surface-hero px-6 py-10 sm:px-10 sm:py-14">
        <p className="eyebrow text-white/80">Pricing</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          Plans that scale from a single store to a multi-branch rollout.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-white/85">
          Every plan includes mobile-first loyalty wallets, QR joins, WhatsApp-ready
          customer messaging, and a deployable AI workspace. Scale up when your
          member base, staff team, or AI load grows.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild variant="gradient" size="lg">
            <Link href="/onboard">Launch on Heita</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/discover">See live businesses</Link>
          </Button>
        </div>
      </section>

      <section className="mt-10 grid gap-4 xl:grid-cols-3">
        {businessPlans.map((plan, index) => (
          <Card
            key={plan.id}
            variant={index === 1 ? "hero" : "surface"}
            className="flex h-full flex-col justify-between gap-6"
          >
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold">{plan.name}</h2>
                  <p className={index === 1 ? "text-white/80" : "text-ink-muted"}>
                    {plan.description}
                  </p>
                </div>
                {index === 1 ? (
                  <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/90">
                    Popular
                  </span>
                ) : null}
              </div>

              <div className="mt-6">
                <p className="font-display text-4xl font-extrabold">
                  {formatZar(plan.monthlyPriceZar)}
                  <span className={index === 1 ? "text-white/80 text-base" : "text-ink-muted text-base"}>
                    /month
                  </span>
                </p>
                <p className={index === 1 ? "mt-2 text-sm text-white/80" : "mt-2 text-sm text-ink-muted"}>
                  Annual option: {formatZar(plan.annualPriceZar)} billed once per year
                </p>
              </div>

              <ul className="mt-6 space-y-3 text-sm">
                {plan.highlights.map((highlight) => (
                  <li key={highlight} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-4">
              <div className={index === 1 ? "rounded-2xl border border-white/15 bg-white/10 p-4 text-sm text-white/85" : "rounded-2xl border border-line bg-surface-elevated p-4 text-sm text-ink-muted"}>
                <p>{formatPlanLimit(plan.limits.members, "members")}</p>
                <p>{formatPlanLimit(plan.limits.staffSeats, "staff seats")}</p>
                <p>{formatPlanLimit(plan.limits.aiMessagesPerMonth, "AI replies / month")}</p>
                <p>{formatPlanLimit(plan.limits.documentUploadsPerMonth, "document uploads / month")}</p>
              </div>
              <Button asChild variant={index === 1 ? "secondary" : "primary"} size="lg">
                {plan.id === "FREE" ? (
                  <Link href="/onboard">{plan.ctaLabel}</Link>
                ) : (
                  <a href="mailto:sales@heita.co.za">{plan.ctaLabel}</a>
                )}
              </Button>
            </div>
          </Card>
        ))}
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-3">
        {differentiators.map(({ title, description, icon: Icon }) => (
          <Card key={title} variant="surface" className="space-y-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary-action">
              <Icon className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">{description}</p>
            </div>
          </Card>
        ))}
      </section>
    </main>
  );
}
