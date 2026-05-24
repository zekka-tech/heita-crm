import Link from "next/link";
import { notFound } from "next/navigation";
import { Gift, Sparkles } from "lucide-react";

import { redeemRewardAction } from "@/app/b/[slug]/rewards/actions";
import { CsrfField } from "@/components/security/csrf-field";
import { RewardCard } from "@/components/loyalty/reward-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip, TierBadge } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { describeTierPerks } from "@/lib/loyalty";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type BusinessRewardsPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BusinessRewardsPage({
  params
}: BusinessRewardsPageProps) {
  const { slug } = await params;
  const session = await auth();

  const business = await prisma.business.findFirst({
    where: { slug, deletedAt: null },
    include: {
      rewards: {
        where: { isActive: true },
        orderBy: { pointsCost: "asc" }
      }
    }
  });

  if (!business) {
    notFound();
  }

  const membership = session?.user?.id
    ? await prisma.membership.findUnique({
        where: {
          businessId_userId: {
            businessId: business.id,
            userId: session.user.id
          }
        },
        include: { tier: true }
      })
    : null;

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <Card variant="hero" className="px-6 py-8 sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
          {business.name} · Rewards
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Spend points on rewards you actually want
        </h1>
        {membership ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 text-white/90">
            <Chip
              variant="primary"
              className="bg-white/15 text-white border-white/20"
            >
              <Sparkles className="h-3 w-3" />
              {membership.pointsBalance.toLocaleString()} points
            </Chip>
            <TierBadge tier={membership.tier?.name} />
          </div>
        ) : (
          <p className="mt-3 text-white/85">
            Join this business to unlock and redeem rewards.
          </p>
        )}
      </Card>

      {!membership && session?.user?.id ? (
        <Card variant="surface" className="mt-6 flex items-center justify-between">
          <p className="text-sm text-ink-muted">
            Membership required to redeem rewards.
          </p>
          <Button asChild variant="primary">
            <Link href={`/b/${slug}/join`}>Join now</Link>
          </Button>
        </Card>
      ) : null}

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {business.rewards.length ? (
          business.rewards.map((reward) => {
            const stockOK =
              reward.stock === null || reward.stock === undefined
                ? true
                : reward.stock > 0;
            const canRedeem = Boolean(
              membership &&
                membership.pointsBalance >= reward.pointsCost &&
                stockOK
            );

            return (
              <RewardCard
                key={reward.id}
                reward={reward}
                available={Boolean(
                  membership && membership.pointsBalance >= reward.pointsCost
                )}
                perkLabels={membership?.tier ? describeTierPerks(membership.tier.perks) : []}
                action={
                  membership ? (
                    <form action={redeemRewardAction}>
                      <CsrfField />
                      <input type="hidden" name="businessId" value={business.id} />
                      <input type="hidden" name="slug" value={business.slug} />
                      <input type="hidden" name="rewardId" value={reward.id} />
                      <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                      <Button
                        type="submit"
                        variant={canRedeem ? "primary" : "secondary"}
                        size="sm"
                        disabled={!canRedeem}
                      >
                        {canRedeem
                          ? "Redeem"
                          : !stockOK
                            ? "Sold out"
                            : "Not enough"}
                      </Button>
                    </form>
                  ) : (
                    <Button asChild variant="primary" size="sm">
                      <Link
                        href={
                          session?.user?.id
                            ? `/b/${slug}/join`
                            : `/sign-in?callbackUrl=/b/${slug}/rewards`
                        }
                      >
                        Join to redeem
                      </Link>
                    </Button>
                  )
                }
              />
            );
          })
        ) : (
          <Card variant="outline" className="md:col-span-2 text-center">
            <Gift className="mx-auto h-7 w-7 text-ink-subtle" />
            <p className="mt-3 text-ink-muted">No rewards published yet.</p>
          </Card>
        )}
      </section>
    </main>
  );
}
