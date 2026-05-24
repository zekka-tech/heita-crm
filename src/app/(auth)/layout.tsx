import Link from "next/link";
import { Shield, Sparkles, Users } from "lucide-react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";

export default function AuthLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="surface-hero hidden flex-col justify-between gap-10 rounded-2xl p-10 text-navy-foreground shadow-xl lg:flex">
          <header className="flex items-center justify-between text-sm">
            <Link href="/" className="font-display text-lg font-bold tracking-tight">
              Heita
            </Link>
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs">
              Mobile-first CRM
            </span>
          </header>

          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
              Built for South African retailers
            </p>
            <h2 className="font-display text-4xl font-extrabold leading-tight">
              One wallet. Every shop. Every conversation.
            </h2>
            <p className="max-w-md text-white/85">
              Customers carry their loyalty status across every business they
              join — and you talk to them where they already are.
            </p>
          </div>

          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2">
              <Users className="h-4 w-4" />
              Multi-business memberships per customer
            </li>
            <li className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2">
              <Sparkles className="h-4 w-4" />
              AI workspace trained on your documents
            </li>
            <li className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2">
              <Shield className="h-4 w-4" />
              Rate-limited OTP, WhatsApp Cloud API, CSP locked
            </li>
          </ul>
        </section>

        <section className="flex flex-col items-center justify-center gap-4">
          <div className="self-end">
            <LanguageSwitcher />
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
