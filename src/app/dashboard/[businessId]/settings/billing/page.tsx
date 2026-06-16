import { redirect } from "next/navigation";
import { Receipt, Send, Zap } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { auth } from "@/lib/auth";
import {
  businessPlans,
  formatPlanLimit,
  formatZar,
  getBusinessPlan
} from "@/lib/billing";
import { withBusinessScope } from "@/lib/prisma";
import {
  getActiveSubscription,
  getEffectivePlan,
  listInvoices
} from "@/server/services/billing.service";
import { getConfiguredProviders } from "@/server/services/payments/registry";
import { getMonthlyMessageUsage } from "@/server/services/message-usage.service";
import { getMerchantCreditBalance } from "@/server/services/merchant-credit.service";
import { listActiveReachPacks } from "@/server/services/reach-pack.service";
import { REACH_PACK_SKUS } from "@/lib/reach-packs";
import { CsrfField } from "@/components/security/csrf-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { purchaseReachPackAction } from "./actions";

export const dynamic = "force-dynamic";

type BillingPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ checkout?: string; plan?: string; sales?: string; reachpack?: string; msg?: string }>;
};

export default async function BillingPage({
  params,
  searchParams
}: BillingPageProps) {
  const { businessId } = await params;
  const { checkout, sales, reachpack, msg: reachpackMsg } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/billing`);
  }

  const [planId, activeSub, invoices, business, paymentProviders, messageUsage, creditBalance, activePacks] =
    await Promise.all([
      getEffectivePlan(businessId),
      getActiveSubscription(businessId),
      listInvoices(businessId),
      withBusinessScope(businessId, (tx) => {
        return tx.business.findUnique({
          where: { id: businessId },
          select: { name: true }
        });
      }),
      Promise.resolve(getConfiguredProviders()),
      getMonthlyMessageUsage(businessId),
      getMerchantCreditBalance(businessId),
      listActiveReachPacks(businessId)
    ]);

  const currentPlan = getBusinessPlan(planId);

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8 space-y-8">
      <div>
        <p className="eyebrow">Billing</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
          {business?.name} · Plan &amp; invoices
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Manage your subscription and download past invoices.
        </p>
      </div>

      {checkout === "success" && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          Subscription activated — your plan has been upgraded.
        </div>
      )}

      {sales === "upgrade" && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-ink">
          Sales pipeline is available on paid plans only. Upgrade to Starter, Growth, or Scale to create sales threads, send documents, and approve AI follow-ups.
        </div>
      )}

      {/* Current plan */}
      <Card variant="surface">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary-action" />
              <span className="text-sm font-semibold text-ink-subtle uppercase tracking-wider">
                Current plan
              </span>
            </div>
            <p className="mt-1 font-display text-2xl font-bold text-ink">
              {currentPlan.name}
            </p>
            <p className="mt-1 text-sm text-ink-muted">{currentPlan.description}</p>
          </div>
          {activeSub && (
            <Chip variant="primary" size="sm">
              Active
            </Chip>
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 text-sm">
          <div className="rounded-lg bg-surface-elevated px-3 py-2">
            <span className="text-ink-muted">Members</span>
            <p className="font-semibold text-ink">
              {formatPlanLimit(currentPlan.limits.members, "max")}
            </p>
          </div>
          <div className="rounded-lg bg-surface-elevated px-3 py-2">
            <span className="text-ink-muted">Staff seats</span>
            <p className="font-semibold text-ink">
              {formatPlanLimit(currentPlan.limits.staffSeats, "max")}
            </p>
          </div>
          <div className="rounded-lg bg-surface-elevated px-3 py-2">
            <span className="text-ink-muted">AI replies / month</span>
            <p className="font-semibold text-ink">
              {formatPlanLimit(currentPlan.limits.aiMessagesPerMonth, "max")}
            </p>
          </div>
          <div className="rounded-lg bg-surface-elevated px-3 py-2">
            <span className="text-ink-muted">Doc uploads / month</span>
            <p className="font-semibold text-ink">
              {formatPlanLimit(currentPlan.limits.documentUploadsPerMonth, "max")}
            </p>
          </div>
        </div>

        {activeSub && (
          <p className="mt-3 text-xs text-ink-muted">
            Period ends{" "}
            {activeSub.currentPeriodEnd.toLocaleDateString("en-ZA", {
              day: "numeric",
              month: "long",
              year: "numeric"
            })}
          </p>
        )}
      </Card>

      {/* Message usage this month (outbound-message metering) */}
      <Card variant="surface">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-primary-action" />
          <span className="text-sm font-semibold uppercase tracking-wider text-ink-subtle">
            Message usage this month
          </span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 text-sm">
          {[
            { label: "WhatsApp", usage: messageUsage.whatsapp },
            { label: "In-app / push", usage: messageUsage.inApp }
          ].map(({ label, usage }) => (
            <div key={label} className="rounded-lg bg-surface-elevated px-3 py-2">
              <span className="text-ink-muted">{label}</span>
              <p className="font-semibold text-ink">
                {usage.limit === null
                  ? `${usage.used.toLocaleString()} sent (unlimited)`
                  : `${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()}`}
              </p>
              {usage.limit !== null ? (
                <p className={usage.exceeded ? "text-xs text-danger" : "text-xs text-ink-muted"}>
                  {usage.exceeded
                    ? "Monthly allowance reached"
                    : `${(usage.remaining ?? 0).toLocaleString()} remaining`}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-subtle">
          SMS and email sends are not metered against a plan allowance yet.
        </p>
      </Card>

      {/* Reach-packs: buy extra outbound-message volume with account credit */}
      <Card variant="surface">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary-action" />
            <span className="text-sm font-semibold uppercase tracking-wider text-ink-subtle">
              Reach-packs
            </span>
          </div>
          <Chip variant="primary" size="sm">
            Credit: {formatZar(creditBalance)}
          </Chip>
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          Top up extra messaging volume on top of your plan, paid from account credit (earned via referrals).
        </p>

        {reachpack === "success" ? (
          <p className="mt-3 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
            Reach-pack added — your effective allowance has increased.
          </p>
        ) : null}
        {reachpack === "error" ? (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {reachpackMsg || "Could not buy the reach-pack."}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {REACH_PACK_SKUS.map((sku) => (
            <form
              key={sku.id}
              action={purchaseReachPackAction}
              className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-elevated px-3 py-2"
            >
              <CsrfField />
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="packId" value={sku.id} />
              <div>
                <p className="text-sm font-semibold text-ink">{sku.label}</p>
                <p className="text-xs text-ink-muted">{formatZar(sku.priceZar)} · {sku.validDays} days</p>
              </div>
              <SubmitButton variant="secondary" disabled={creditBalance < sku.priceZar}>
                Buy
              </SubmitButton>
            </form>
          ))}
        </div>

        {activePacks.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-ink-subtle">Active packs</p>
            <ul className="mt-2 space-y-1 text-sm text-ink-muted">
              {activePacks.map((pack) => (
                <li key={pack.id}>
                  +{pack.units.toLocaleString()} {pack.group === "WHATSAPP" ? "WhatsApp" : "in-app"} · expires{" "}
                  {pack.expiresAt.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {/* Upgrade options */}
      {planId !== "SCALE" && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-ink">
            Upgrade your plan
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {businessPlans
              .filter(
                (p) =>
                  p.monthlyPriceZar > currentPlan.monthlyPriceZar ||
                  p.monthlyPriceZar === 0
              )
              .filter((p) => p.monthlyPriceZar > 0)
              .map((plan) => (
                <Card key={plan.id} variant="outline" className="space-y-3">
                  <div>
                    <p className="font-display font-bold text-ink">{plan.name}</p>
                    <p className="text-sm text-ink-muted">{plan.description}</p>
                  </div>
                  <p className="text-2xl font-bold text-ink">
                    {formatZar(plan.monthlyPriceZar)}
                    <span className="text-sm font-normal text-ink-muted"> / month</span>
                  </p>
                  <ul className="space-y-1 text-sm text-ink-muted">
                    {plan.highlights.map((h) => (
                      <li key={h} className="flex items-center gap-2">
                        <span className="text-green-500">✓</span> {h}
                      </li>
                    ))}
                  </ul>
                  <CheckoutButton
                    businessId={businessId}
                    planId={plan.id}
                    label={`Upgrade to ${plan.name}`}
                    providers={paymentProviders}
                  />
                </Card>
              ))}
          </div>
        </section>
      )}

      {/* Invoice history */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-ink-muted" />
          <h2 className="font-display text-lg font-semibold text-ink">
            Invoice history
          </h2>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-ink-muted">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="py-2 text-left font-semibold text-ink-subtle">
                    Period
                  </th>
                  <th className="py-2 text-left font-semibold text-ink-subtle">
                    Plan
                  </th>
                  <th className="py-2 text-right font-semibold text-ink-subtle">
                    Amount
                  </th>
                  <th className="py-2 text-right font-semibold text-ink-subtle">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-line/50">
                    <td className="py-2 text-ink">
                      {inv.periodStart.toLocaleDateString("en-ZA", {
                        month: "short",
                        year: "numeric"
                      })}
                    </td>
                    <td className="py-2 text-ink capitalize">
                      {inv.planId.toLowerCase()}
                    </td>
                    <td className="py-2 text-right text-ink">
                      {formatZar(inv.amountZar)}
                    </td>
                    <td className="py-2 text-right">
                      <Chip
                        variant={inv.status === "PAID" ? "success" : "warning"}
                        size="sm"
                      >
                        {inv.status.toLowerCase()}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

