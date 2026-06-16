import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { formatZar } from "@/lib/billing";
import { env } from "@/lib/env";
import {
  getMerchantCreditBalance,
  listMerchantCreditEntries
} from "@/server/services/merchant-credit.service";
import {
  getOrCreateMerchantReferralCode,
  listReferralsMadeByBusiness,
  merchantReferralRewardZar
} from "@/server/services/merchant-referral.service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ businessId: string }>;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  REWARDED: "Rewarded",
  VOID: "Void"
};

export default async function ReferralsPage({ params }: PageProps) {
  const { businessId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/referrals`);
  }

  const [code, balance, referrals, ledger] = await Promise.all([
    getOrCreateMerchantReferralCode(businessId),
    getMerchantCreditBalance(businessId),
    listReferralsMadeByBusiness(businessId),
    listMerchantCreditEntries(businessId, 20)
  ]);

  const appUrl = env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const shareLink = `${appUrl}/onboard?mref=${code.code}`;
  const rewardZar = merchantReferralRewardZar();
  const rewardedCount = referrals.filter((r) => r.status === "REWARDED").length;

  return (
    <main className="space-y-8 px-4 pb-24 pt-6 sm:px-8">
      <div>
        <p className="eyebrow">Referrals</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
          Refer another business
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
          Share your referral link with other business owners. When a business you refer signs up and
          pays its first invoice, you earn <strong>{formatZar(rewardZar)}</strong> account credit that
          automatically reduces your next bill.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card variant="surface" className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Available credit</p>
          <p className="text-2xl font-bold text-ink">{formatZar(balance)}</p>
        </Card>
        <Card variant="surface" className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Referrals rewarded</p>
          <p className="text-2xl font-bold text-ink">{rewardedCount}</p>
        </Card>
        <Card variant="surface" className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Total referred</p>
          <p className="text-2xl font-bold text-ink">{referrals.length}</p>
        </Card>
      </section>

      <Card variant="surface" className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-ink">Your referral link</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Chip variant="primary" size="sm">
            {code.code}
          </Chip>
          <code className="break-all rounded-lg bg-surface-elevated px-3 py-2 text-sm text-ink">
            {shareLink}
          </code>
        </div>
        <p className="text-xs text-ink-muted">
          Anyone who creates a business from this link is attributed to you.
        </p>
      </Card>

      <Card variant="surface" className="space-y-3 overflow-x-auto">
        <h2 className="font-display text-lg font-semibold text-ink">Businesses you referred</h2>
        {referrals.length === 0 ? (
          <p className="text-sm text-ink-muted">No referrals yet. Share your link to get started.</p>
        ) : (
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3">Business</th>
                <th className="py-2 pr-3">Joined</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Reward</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.id} className="border-b border-line/60">
                  <td className="py-2 pr-3 font-medium text-ink">{r.referredBusiness.name}</td>
                  <td className="py-2 pr-3 text-ink-muted">
                    {r.referredBusiness.createdAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="py-2 pr-3">{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td className="py-2 pr-3 text-right">
                    {r.status === "REWARDED" ? formatZar(r.rewardAmountZar) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card variant="surface" className="space-y-3 overflow-x-auto">
        <h2 className="font-display text-lg font-semibold text-ink">Credit history</h2>
        {ledger.length === 0 ? (
          <p className="text-sm text-ink-muted">No credit activity yet.</p>
        ) : (
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 pr-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((entry) => (
                <tr key={entry.id} className="border-b border-line/60">
                  <td className="py-2 pr-3 text-ink-muted">{entry.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="py-2 pr-3 text-ink">{entry.description ?? entry.type}</td>
                  <td
                    className={
                      entry.amountZar >= 0
                        ? "py-2 pr-3 text-right text-success"
                        : "py-2 pr-3 text-right text-ink"
                    }
                  >
                    {entry.amountZar >= 0 ? "+" : "−"}
                    {formatZar(Math.abs(entry.amountZar))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </main>
  );
}
