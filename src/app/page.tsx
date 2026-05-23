import Link from "next/link";
import { ArrowRight, MessageCircle, QrCode, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

const highlights = [
  {
    title: "Join from anywhere",
    description: "Customers can enter via QR, WhatsApp, a printed receipt, or a direct link.",
    icon: QrCode
  },
  {
    title: "Messaging-first CRM",
    description: "SMS, WhatsApp, push, and in-app notifications converge into one business timeline.",
    icon: MessageCircle
  },
  {
    title: "AI co-worker",
    description: "Each business gets a document-aware workspace powered by Ollama with cloud fallback.",
    icon: Sparkles
  }
];

export default function LandingPage() {
  return (
    <main className="px-4 pb-16 pt-6 sm:px-8">
      <section className="surface overflow-hidden rounded-[2rem] p-6 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#af5f33]">
          Heita CRM
        </p>
        <div className="mt-6 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-[#143127] sm:text-6xl">
              Loyalty, messaging, and AI workspaces in one mobile-first system.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#456356]">
              Built for South African retailers and small businesses that need direct
              communication with customers, not another desktop-heavy CRM.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/onboard">
                  Start onboarding
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/sign-in">Open app shell</Link>
              </Button>
            </div>
          </div>
          <div className="rounded-[1.75rem] bg-[#1d3c34] p-5 text-[#f9f6f1]">
            <p className="text-sm font-medium text-[#d4e2da]">Phase 0 status</p>
            <ul className="mt-6 space-y-4 text-sm leading-6">
              <li>Next.js, Prisma, Docker, PWA, and AI integration scaffolding are defined.</li>
              <li>Business, loyalty, messaging, and AI route groups are present for implementation.</li>
              <li>Node.js and package installation are still required before build, migrate, and run.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {highlights.map(({ title, description, icon: Icon }) => (
          <article key={title} className="surface rounded-[1.5rem] p-5">
            <Icon className="h-6 w-6 text-[#af5f33]" />
            <h2 className="mt-4 text-lg font-semibold text-[#143127]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#456356]">{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

