import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Sparkles,
  Wallet
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";

const features = [
  {
    title: "Join from anywhere",
    description:
      "QR codes in store, on receipts, on product tags, on a WhatsApp message, or a direct link — every entry lands on the same business profile.",
    icon: QrCode
  },
  {
    title: "WhatsApp-native messaging",
    description:
      "SMS, WhatsApp, push, and in-app notifications converge into one timeline per customer, governed by your team.",
    icon: MessageCircle
  },
  {
    title: "AI co-worker per business",
    description:
      "Each shop trains a document-aware AI on its own catalog, FAQs, and policies. Ollama by default, cloud fallback when you need it.",
    icon: Sparkles
  },
  {
    title: "Loyalty that earns trust",
    description:
      "Tiers, rewards, promotions, signup bonuses and event reminders, all wired into one wallet your customer can carry anywhere.",
    icon: Wallet
  },
  {
    title: "Mobile-first PWA",
    description:
      "Installable, offline-aware, and fast on the data plans South Africans actually use. No app store gatekeeping.",
    icon: BadgeCheck
  },
  {
    title: "Built for trust",
    description:
      "Verified WhatsApp webhooks, rate-limited OTPs, CSP locked down, tenants isolated by row-level policies.",
    icon: ShieldCheck
  }
];

export default function LandingPage() {
  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <section className="surface-hero relative px-6 py-10 sm:px-12 sm:py-16">
        <div className="relative grid gap-10 lg:grid-cols-[1.35fr_0.85fr] lg:items-center">
          <div>
            <Chip variant="primary" className="bg-white/15 text-white border-white/20">
              Heita CRM · South Africa
            </Chip>
            <h1 className="mt-6 max-w-3xl font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
              Loyalty, messaging, and AI workspaces in one mobile-first system.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/85 sm:text-lg">
              Heita gives retailers and small businesses a direct line to their
              customers — through WhatsApp, QR, and a fast, installable app that
              works on the data plans South Africans actually use.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/onboard">
                  Onboard your business
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
            <div className="mt-8 grid max-w-md grid-cols-3 gap-3 text-white/85">
              <div>
                <p className="metric-value text-white">9</p>
                <p className="metric-label text-white/70">Provinces ready</p>
              </div>
              <div>
                <p className="metric-value text-white">WhatsApp</p>
                <p className="metric-label text-white/70">Cloud API native</p>
              </div>
              <div>
                <p className="metric-value text-white">PWA</p>
                <p className="metric-label text-white/70">Installable</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="surface-glass rounded-2xl p-6 text-ink shadow-xl">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white text-base font-display font-bold shadow-glow">
                  IS
                </div>
                <div>
                  <p className="font-display text-base font-semibold">
                    Inky Shop Fourways
                  </p>
                  <p className="text-xs text-ink-subtle">Specialty retail · Gauteng</p>
                </div>
                <Chip variant="success" size="sm" className="ml-auto">
                  Member
                </Chip>
              </div>
              <div className="mt-5 grid grid-cols-3 divide-x divide-line rounded-xl bg-surface-elevated">
                <div className="px-3 py-3 text-center">
                  <p className="font-display text-xl font-bold text-primary-action">
                    1,240
                  </p>
                  <p className="text-[0.65rem] uppercase tracking-wider text-ink-subtle">
                    Points
                  </p>
                </div>
                <div className="px-3 py-3 text-center">
                  <p className="font-display text-xl font-bold text-tier-gold">Gold</p>
                  <p className="text-[0.65rem] uppercase tracking-wider text-ink-subtle">
                    Tier
                  </p>
                </div>
                <div className="px-3 py-3 text-center">
                  <p className="font-display text-xl font-bold text-success">3</p>
                  <p className="text-[0.65rem] uppercase tracking-wider text-ink-subtle">
                    Rewards
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-xl bg-primary/10 p-3 text-xs leading-5 text-primary-action">
                <span className="font-semibold">AI co-worker:</span> Hi Lerato — your
                next coffee is on us. Tap to redeem the Gold-tier free latte.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {features.map(({ title, description, icon: Icon }) => (
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

      <section className="mt-12 surface-hero p-8 sm:p-12">
        <div className="grid items-center gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div>
            <p className="eyebrow text-white/80">Ready when you are</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Stand-up a loyalty programme in one afternoon.
            </h2>
            <p className="mt-4 max-w-2xl text-white/85">
              No POS plug-ins, no app store reviews, no waiting on a developer.
              Onboard your business, print one QR code, and start the conversation.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Button asChild variant="gradient" size="lg">
              <Link href="/onboard">Start onboarding</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/sign-in">Open the app</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
