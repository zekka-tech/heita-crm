import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CsrfField } from "@/components/security/csrf-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { auth } from "@/lib/auth";
import { formatZar } from "@/lib/billing";
import { isPlatformAdmin } from "@/lib/platform-admin";
import {
  getChannelCacLtv,
  type ChannelCacLtvReport
} from "@/server/services/acquisition-analytics.service";
import { listAdSpend } from "@/server/services/ad-spend.service";
import { recordAdSpendAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CAC / LTV by channel"
};

type PageProps = {
  searchParams?: Promise<{ months?: string; recorded?: string; error?: string }>;
};

function ratioLabel(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}×`;
}

function cacLabel(value: number | null): string {
  return value === null ? "—" : formatZar(Math.round(value));
}

export default async function CacLtvAdminPage({ searchParams }: PageProps) {
  const session = await auth();
  // 404 (not 403) so the route's existence is not revealed to non-admins.
  if (!isPlatformAdmin(session?.user?.id)) {
    notFound();
  }

  const resolved = searchParams ? await searchParams : {};
  const months = Number(resolved.months ?? 12);

  const [report, spend]: [ChannelCacLtvReport, Awaited<ReturnType<typeof listAdSpend>>] =
    await Promise.all([getChannelCacLtv(Number.isFinite(months) ? months : 12), listAdSpend(20)]);

  const cohortMonths = [...new Set(report.cohorts.map((c) => c.cohortMonth))];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8">
      <header className="space-y-2">
        <Chip variant="primary" size="sm">
          Platform admin
        </Chip>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
          CAC / LTV by acquisition channel
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-ink-muted">
          Per-channel merchant acquisition economics over the trailing {Number.isFinite(months) ? months : 12}{" "}
          months. Channel comes from each business&apos;s onboarding attribution; revenue from paid invoices;
          spend from recorded ad spend. Amounts in Rand.
        </p>
      </header>

      {resolved.error ? (
        <Card variant="outline" className="border-danger/40 bg-danger/5 text-sm text-danger">
          {resolved.error}
        </Card>
      ) : null}
      {resolved.recorded ? (
        <Card variant="outline" className="border-success/40 bg-success/5 text-sm text-success">
          Ad spend recorded.
        </Card>
      ) : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card variant="surface" className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Businesses</p>
          <p className="text-2xl font-bold text-ink">{report.totals.businesses.toLocaleString()}</p>
          <p className="text-xs text-ink-muted">{report.totals.payingBusinesses.toLocaleString()} paying</p>
        </Card>
        <Card variant="surface" className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Ad spend</p>
          <p className="text-2xl font-bold text-ink">{formatZar(report.totals.spendZar)}</p>
        </Card>
        <Card variant="surface" className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Blended CAC</p>
          <p className="text-2xl font-bold text-ink">{cacLabel(report.totals.blendedCacZar)}</p>
          <p className="text-xs text-ink-muted">LTV {formatZar(Math.round(report.totals.blendedLtvZar))}</p>
        </Card>
        <Card variant="surface" className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Blended LTV:CAC</p>
          <p className="text-2xl font-bold text-ink">{ratioLabel(report.totals.blendedLtvCacRatio)}</p>
        </Card>
      </section>

      <Card variant="surface" className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-ink">Referral programme</h2>
        <p className="text-sm text-ink-muted">
          B2B merchant referral as its own channel. CAC is the Rand credit granted to referrers; LTV is
          paid-invoice revenue per referred business.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Referred</p>
            <p className="text-xl font-bold text-ink">{report.referral.referredBusinesses.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Paying</p>
            <p className="text-xl font-bold text-ink">{report.referral.payingBusinesses.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Credit paid</p>
            <p className="text-xl font-bold text-ink">{formatZar(report.referral.rewardSpendZar)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Revenue</p>
            <p className="text-xl font-bold text-ink">{formatZar(report.referral.revenueZar)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">CAC</p>
            <p className="text-xl font-bold text-ink">{cacLabel(report.referral.cacZar)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">LTV:CAC</p>
            <p className="text-xl font-bold text-ink">{ratioLabel(report.referral.ltvCacRatio)}</p>
          </div>
        </div>
      </Card>

      <Card variant="surface" className="space-y-3 overflow-x-auto">
        <h2 className="font-display text-lg font-semibold text-ink">Per-channel economics</h2>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <th className="py-2 pr-3">Channel</th>
              <th className="py-2 pr-3 text-right">Businesses</th>
              <th className="py-2 pr-3 text-right">Paying</th>
              <th className="py-2 pr-3 text-right">Spend</th>
              <th className="py-2 pr-3 text-right">Revenue</th>
              <th className="py-2 pr-3 text-right">CAC</th>
              <th className="py-2 pr-3 text-right">LTV</th>
              <th className="py-2 pr-3 text-right">LTV:CAC</th>
            </tr>
          </thead>
          <tbody>
            {report.channels.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-4 text-center text-ink-muted">
                  No businesses acquired in this window.
                </td>
              </tr>
            ) : (
              report.channels.map((row) => (
                <tr key={row.channel} className="border-b border-line/60">
                  <td className="py-2 pr-3 font-medium text-ink">{row.channel}</td>
                  <td className="py-2 pr-3 text-right">{row.businesses.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right">{row.payingBusinesses.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right">{formatZar(row.spendZar)}</td>
                  <td className="py-2 pr-3 text-right">{formatZar(row.revenueZar)}</td>
                  <td className="py-2 pr-3 text-right">{cacLabel(row.cacZar)}</td>
                  <td className="py-2 pr-3 text-right">{formatZar(Math.round(row.ltvZar))}</td>
                  <td className="py-2 pr-3 text-right">{ratioLabel(row.ltvCacRatio)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Card variant="surface" className="space-y-3 overflow-x-auto">
        <h2 className="font-display text-lg font-semibold text-ink">Monthly cohorts (businesses acquired)</h2>
        {cohortMonths.length === 0 ? (
          <p className="text-sm text-ink-muted">No cohort data in this window.</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3">Cohort</th>
                <th className="py-2 pr-3">Channel</th>
                <th className="py-2 pr-3 text-right">Businesses</th>
                <th className="py-2 pr-3 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {report.cohorts.map((cell) => (
                <tr key={`${cell.cohortMonth}:${cell.channel}`} className="border-b border-line/60">
                  <td className="py-2 pr-3 font-medium text-ink">{cell.cohortMonth}</td>
                  <td className="py-2 pr-3">{cell.channel}</td>
                  <td className="py-2 pr-3 text-right">{cell.businesses.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right">{formatZar(cell.revenueZar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card variant="surface" className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Record ad spend</h2>
          <p className="text-sm text-ink-muted">
            Spend feeds the CAC numerator. Recording the same channel and period overwrites the amount.
          </p>
        </div>
        <form action={recordAdSpendAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <CsrfField />
          <Input label="Channel" name="channel" placeholder="google" required />
          <Input label="Period start" name="periodStart" type="date" required />
          <Input label="Period end" name="periodEnd" type="date" required />
          <Input label="Amount (R)" name="amountZar" type="number" min="0" step="1" required />
          <Input label="Note" name="note" placeholder="optional" />
          <div className="sm:col-span-2 lg:col-span-5">
            <Button type="submit" variant="primary">
              Record spend
            </Button>
          </div>
        </form>

        {spend.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                  <th className="py-2 pr-3">Channel</th>
                  <th className="py-2 pr-3">Period</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {spend.map((row) => (
                  <tr key={row.id} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-medium text-ink">{row.channel}</td>
                    <td className="py-2 pr-3 text-ink-muted">
                      {row.periodStart.toISOString().slice(0, 10)} → {row.periodEnd.toISOString().slice(0, 10)}
                    </td>
                    <td className="py-2 pr-3 text-right">{formatZar(row.amountZar)}</td>
                    <td className="py-2 pr-3 text-ink-muted">{row.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
