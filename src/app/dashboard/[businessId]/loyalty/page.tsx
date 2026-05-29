import { notFound, redirect } from "next/navigation";
import { Gift, Plus, Receipt, Users } from "lucide-react";

import {
  createRewardAction,
  queueCustomerImportAction,
  requestStaffStepUpAction,
  updateTierPerksAction,
  verifyStaffStepUpAction
} from "@/app/dashboard/[businessId]/loyalty/actions";
import { EarnPointsForm } from "@/app/dashboard/[businessId]/loyalty/earn-points-form";
import { RedeemPointsForm } from "@/app/dashboard/[businessId]/loyalty/redeem-points-form";
import { RefundTransactionForm } from "@/app/dashboard/[businessId]/loyalty/refund-transaction-form";
import { CsrfField } from "@/components/security/csrf-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import { Chip, TierBadge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
export const dynamic = "force-dynamic";
import { isBuildPhase } from "@/lib/build-phase";
import { describeTierPerks } from "@/lib/loyalty";

type LoyaltyDashboardPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ stepUp?: string; devCode?: string }>;
};

export default async function LoyaltyDashboardPage({
  params,
  searchParams
}: LoyaltyDashboardPageProps) {
  const { businessId } = await params;

  if (isBuildPhase()) {
    return <main className="px-4 pb-24 pt-6 sm:px-8" />;
  }

  const [{ auth }, { prisma }, { hasFreshStaffStepUp }] = await Promise.all([
    import("@/lib/auth"),
    import("@/lib/prisma"),
    import("@/lib/staff-step-up")
  ]);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      deletedAt: null,
      staffMembers: { some: { userId: session.user.id } }
    },
    include: {
      memberships: {
        include: {
          user: true,
          tier: true,
          transactions: {
            orderBy: { createdAt: "desc" },
            take: 3
          }
        },
        orderBy: { joinedAt: "desc" }
      },
      rewards: { orderBy: { createdAt: "desc" } },
      loyaltyTiers: { orderBy: { minPoints: "asc" } },
      importRuns: {
        orderBy: { createdAt: "desc" },
        take: 5
      }
    }
  });

  if (!business) notFound();

  const stepUpVerified = await hasFreshStaffStepUp({
    userId: session.user.id,
    businessId
  });

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <div className="grid gap-5">
        <Card variant="hero" className="px-6 py-7 sm:px-10">
          <Chip variant="primary" className="bg-white/15 text-white border-white/20">
            {business.name} · Loyalty
          </Chip>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Loyalty engine controls
          </h1>
          <p className="mt-2 max-w-2xl text-white/85">
            Issue points, redeem on behalf of customers, manage your reward
            catalogue, and watch tier progression in real time.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-white/85">
            {business.loyaltyTiers.map((tier) => (
              <div key={tier.id} className="flex flex-wrap items-center gap-2">
                <TierBadge tier={tier.name} />
                {describeTierPerks(tier.perks).map((perk) => (
                  <Chip
                    key={`${tier.id}-${perk}`}
                    variant="primary"
                    className="bg-white/15 text-white border-white/20"
                  >
                    {perk}
                  </Chip>
                ))}
              </div>
            ))}
          </div>
        </Card>

        {!stepUpVerified ? (
          <Card variant="outline" className="space-y-4 border-warning/40 bg-warning/5">
            <h2 className="section-title">Staff verification required</h2>
            <p className="text-sm text-ink-muted">
              Enter a fresh OTP before issuing points, redeeming balances, or changing the
              reward catalogue. The verification stays valid for 15 minutes.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <form action={requestStaffStepUpAction} className="grid gap-3">
                <CsrfField />
                <input type="hidden" name="businessId" value={business.id} />
                <SubmitButton variant="secondary">
                  Send staff OTP
                </SubmitButton>
              </form>
              <form action={verifyStaffStepUpAction} className="grid gap-3">
                <CsrfField />
                <input type="hidden" name="businessId" value={business.id} />
                <Input
                  name="code"
                  label="Verification code"
                  inputMode="numeric"
                  pattern="\d{6}"
                  placeholder="123456"
                  required
                />
                <SubmitButton variant="primary">
                  Verify staff access
                </SubmitButton>
              </form>
            </div>
            {resolvedSearchParams.stepUp ? (
              <p className="text-sm text-ink-muted">
                {resolvedSearchParams.stepUp === "requested"
                  ? "Verification code sent."
                  : resolvedSearchParams.stepUp === "invalid"
                    ? "Verification failed. Request a new code and try again."
                    : "Staff verification completed."}
                {resolvedSearchParams.devCode ? ` Dev OTP: ${resolvedSearchParams.devCode}` : ""}
              </p>
            ) : null}
          </Card>
        ) : (
          <Card variant="surface" className="text-sm text-success">
            Staff verification is active for this business for the next 15 minutes.
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card variant="surface" className="space-y-4">
            <header className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-success" />
              <h2 className="section-title">Issue points</h2>
            </header>
            <EarnPointsForm
              businessId={business.id}
              memberships={business.memberships}
              csrfField={<CsrfField />}
            />
          </Card>

          <Card variant="surface" className="space-y-4">
            <header className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-warning" />
              <h2 className="section-title">Redeem manually</h2>
            </header>
            <RedeemPointsForm
              businessId={business.id}
              memberships={business.memberships}
              csrfField={<CsrfField />}
            />
          </Card>

          <Card variant="surface" className="space-y-4">
            <header className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary-action" />
              <h2 className="section-title">Bulk customer import</h2>
            </header>
            <p className="text-sm text-ink-muted">
              Upload a CSV with <code>name</code>, <code>phone</code>, optional{" "}
              <code>openingPoints</code>, and optional <code>tier</code>. Existing
              memberships are skipped; new members get an imported opening balance.
            </p>
            <form action={queueCustomerImportAction} className="grid gap-3">
              <CsrfField />
              <input type="hidden" name="businessId" value={business.id} />
              <Input
                name="csvFile"
                type="file"
                label="Customer CSV"
                accept=".csv,text/csv"
                required
              />
              <SubmitButton variant="primary">
                Queue import
              </SubmitButton>
            </form>
            <div className="grid gap-2">
              {business.importRuns.length ? (
                business.importRuns.map((run) => (
                  <div
                    key={run.id}
                    className="rounded-xl border border-line bg-surface-elevated px-3 py-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-ink">{run.fileName}</p>
                      <Chip
                        variant={
                          run.status === "COMPLETED"
                            ? "success"
                            : run.status === "FAILED"
                              ? "warning"
                              : "primary"
                        }
                        size="sm"
                      >
                        {run.status}
                      </Chip>
                    </div>
                    <p className="mt-1 text-xs text-ink-subtle">
                      {run.importedRows} imported · {run.skippedRows} skipped ·{" "}
                      {run.failedRows} failed
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-ink-subtle">No customer imports yet.</p>
              )}
            </div>
          </Card>
        </div>

        <Card variant="surface" className="space-y-4">
          <header className="flex items-center justify-between">
            <h2 className="section-title">Tier perks</h2>
            <Chip variant="primary" size="sm">
              OWNER only
            </Chip>
          </header>
          <div className="grid gap-3 lg:grid-cols-3">
            {business.loyaltyTiers.map((tier) => {
              const perks = describeTierPerks(tier.perks);
              const tierPerks =
                typeof tier.perks === "object" && tier.perks && !Array.isArray(tier.perks)
                  ? tier.perks
                  : {};

              return (
                <form
                  key={tier.id}
                  action={updateTierPerksAction}
                  className="grid gap-3 rounded-xl border border-line bg-surface-elevated p-4"
                >
                  <CsrfField />
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="tierId" value={tier.id} />
                  <div>
                    <p className="font-display text-lg font-semibold text-ink">{tier.name}</p>
                    <p className="text-xs text-ink-subtle">
                      Current: {perks.length ? perks.join(" · ") : "No perks configured"}
                    </p>
                  </div>
                  <Input
                    name="pointMultiplier"
                    label="Point multiplier"
                    type="number"
                    min={1}
                    step="0.05"
                    defaultValue={
                      "pointMultiplier" in tierPerks
                        ? String(tierPerks.pointMultiplier)
                        : ""
                    }
                    placeholder="1.10"
                  />
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      name="freeDelivery"
                      defaultChecked={
                        "freeDelivery" in tierPerks && Boolean(tierPerks.freeDelivery)
                      }
                    />
                    Free delivery
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      name="exclusiveAccess"
                      defaultChecked={
                        "exclusiveAccess" in tierPerks && Boolean(tierPerks.exclusiveAccess)
                      }
                    />
                    Exclusive access
                  </label>
                  <SubmitButton variant="secondary">
                    Save perks
                  </SubmitButton>
                </form>
              );
            })}
          </div>
        </Card>

        <Card variant="surface" className="space-y-4">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary-action" />
              <h2 className="section-title">Reward catalogue</h2>
            </div>
            <Chip variant="primary" size="sm">
              {business.rewards.length} rewards
            </Chip>
          </header>
          <form action={createRewardAction} className="grid gap-3 md:grid-cols-4">
            <CsrfField />
            <input type="hidden" name="businessId" value={business.id} />
            <Input
              name="title"
              label="Reward title"
              placeholder="Free drip coffee"
              className="md:col-span-2"
              required
            />
            <Input
              name="pointsCost"
              label="Points cost"
              type="number"
              min={1}
              required
            />
            <Input name="stock" label="Stock" type="number" min={0} placeholder="leave blank for unlimited" />
            <Textarea
              name="description"
              label="Description"
              placeholder="Optional detail customers see"
              className="md:col-span-4"
              rows={3}
            />
            <SubmitButton variant="primary" className="md:col-span-1">
              Add reward
            </SubmitButton>
          </form>

          <div className="grid gap-2">
            {business.rewards.length ? (
              business.rewards.map((reward) => (
                <div
                  key={reward.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface-elevated px-4 py-3"
                >
                  <div>
                    <p className="font-display font-semibold text-ink">
                      {reward.title}
                    </p>
                    {reward.description ? (
                      <p className="mt-1 text-sm text-ink-muted">{reward.description}</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="font-display font-semibold text-primary-action">
                      {reward.pointsCost} pts
                    </p>
                    <p className="text-xs text-ink-subtle">
                      Stock: {reward.stock === null ? "∞" : reward.stock}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-muted">No rewards yet.</p>
            )}
          </div>
        </Card>

        <Card variant="surface" className="space-y-4">
          <header className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary-action" />
            <h2 className="section-title">Members</h2>
          </header>
          {business.memberships.length ? (
            <div className="grid gap-3">
              {business.memberships.map((membership) => (
                <article
                  key={membership.id}
                  className="rounded-xl border border-line bg-surface-elevated p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display font-semibold text-ink">
                        {membership.user.phone ??
                          membership.user.name ??
                          membership.user.id}
                      </p>
                      <p className="mt-1 text-xs text-ink-subtle">
                        Joined {membership.joinedAt.toLocaleDateString("en-ZA")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <TierBadge tier={membership.tier?.name} />
                      <span className="font-display font-bold text-primary-action">
                        {membership.pointsBalance.toLocaleString()} pts
                      </span>
                    </div>
                  </div>
                  {membership.transactions.length ? (
                    <ul className="mt-3 grid gap-1">
                      {membership.transactions.map((transaction) => (
                        <li
                          key={transaction.id}
                          className="rounded-lg bg-surface px-3 py-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-ink-muted">
                              <p>{transaction.description ?? transaction.type}</p>
                              {transaction.expiresAt ? (
                                <p className="mt-1 text-[11px] text-ink-subtle">
                                  Expires {transaction.expiresAt.toLocaleDateString("en-ZA")}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                              <Chip
                                variant={transaction.pointsDelta >= 0 ? "success" : "warning"}
                                size="sm"
                              >
                                {transaction.pointsDelta >= 0 ? "+" : ""}
                                {transaction.pointsDelta}
                              </Chip>
                              {!["REFUND", "EXPIRY"].includes(transaction.type) ? (
                                <RefundTransactionForm
                                  businessId={business.id}
                                  transactionId={transaction.id}
                                  csrfField={<CsrfField />}
                                />
                              ) : null}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No members yet.</p>
          )}
        </Card>
      </div>
    </main>
  );
}
