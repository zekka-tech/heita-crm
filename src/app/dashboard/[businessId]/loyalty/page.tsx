import { notFound, redirect } from "next/navigation";
import { Gift, Plus, Receipt, Users } from "lucide-react";

import {
  createRewardAction,
  earnPointsAction,
  redeemPointsAction
} from "@/app/dashboard/[businessId]/loyalty/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip, TierBadge } from "@/components/ui/badge";
import { Input, Select, Textarea } from "@/components/ui/input";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type LoyaltyDashboardPageProps = {
  params: Promise<{ businessId: string }>;
};

export default async function LoyaltyDashboardPage({
  params
}: LoyaltyDashboardPageProps) {
  const { businessId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
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
      loyaltyTiers: { orderBy: { minPoints: "asc" } }
    }
  });

  if (!business) notFound();

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
              <TierBadge key={tier.id} tier={tier.name} />
            ))}
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card variant="surface" className="space-y-4">
            <header className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-success" />
              <h2 className="section-title">Issue points</h2>
            </header>
            <form action={earnPointsAction} className="grid gap-3">
              <input type="hidden" name="businessId" value={business.id} />
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <Select name="membershipId" label="Customer" defaultValue="" required>
                <option value="" disabled>
                  Select a member
                </option>
                {business.memberships.map((membership) => (
                  <option key={membership.id} value={membership.id}>
                    {membership.user.phone ?? membership.user.name ?? membership.user.id}{" "}
                    · {membership.pointsBalance} pts
                  </option>
                ))}
              </Select>
              <Input
                name="points"
                type="number"
                min={1}
                placeholder="Points to add"
                label="Points"
                required
              />
              <Input name="description" label="Description" placeholder="e.g. In-store purchase" />
              <Button type="submit" variant="primary">
                Issue points
              </Button>
            </form>
          </Card>

          <Card variant="surface" className="space-y-4">
            <header className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-warning" />
              <h2 className="section-title">Redeem manually</h2>
            </header>
            <form action={redeemPointsAction} className="grid gap-3">
              <input type="hidden" name="businessId" value={business.id} />
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <Select name="membershipId" label="Customer" defaultValue="" required>
                <option value="" disabled>
                  Select a member
                </option>
                {business.memberships.map((membership) => (
                  <option key={membership.id} value={membership.id}>
                    {membership.user.phone ?? membership.user.name ?? membership.user.id}{" "}
                    · {membership.pointsBalance} pts
                  </option>
                ))}
              </Select>
              <Input
                name="points"
                type="number"
                min={1}
                placeholder="Points to redeem"
                label="Points"
                required
              />
              <Input
                name="description"
                label="Description"
                placeholder="e.g. Manual staff redemption"
              />
              <Button type="submit" variant="danger">
                Redeem points
              </Button>
            </form>
          </Card>
        </div>

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
            <Button type="submit" variant="primary" className="md:col-span-1">
              Add reward
            </Button>
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
                          className="flex items-center justify-between rounded-lg bg-surface px-3 py-1.5 text-xs"
                        >
                          <span className="text-ink-muted">
                            {transaction.description ?? transaction.type}
                          </span>
                          <Chip
                            variant={transaction.pointsDelta >= 0 ? "success" : "warning"}
                            size="sm"
                          >
                            {transaction.pointsDelta >= 0 ? "+" : ""}
                            {transaction.pointsDelta}
                          </Chip>
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
