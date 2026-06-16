import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButtonForm } from "@/components/auth/sign-out-button-form";
import { cn } from "@/lib/utils";

type SettingsLayoutProps = {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
};

const TABS = [
  { href: "staff", label: "Staff" },
  { href: "integrations", label: "Integrations" },
  { href: "ai-models", label: "AI model" },
  { href: "templates", label: "Templates" },
  { href: "billing", label: "Billing" },
  { href: "referrals", label: "Referrals" },
  { href: "audit", label: "Audit Log" }
] as const;

export default async function DashboardSettingsLayout({
  children,
  params
}: SettingsLayoutProps) {
  const { businessId } = await params;

  return (
    <>
      <div className="border-b border-line px-4 py-4 sm:px-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Settings</p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">
              Business settings
            </h1>
          </div>
          <SignOutButtonForm label="Log out" />
        </div>

        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Business settings tabs">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={`/dashboard/${businessId}/settings/${tab.href}` as Route}
              className={cn(
                "rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-muted transition-colors",
                "hover:border-primary/30 hover:text-primary-action"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      {children}
    </>
  );
}
