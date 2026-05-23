import { notFound } from "next/navigation";

import { redeemRewardAction } from "@/app/b/[slug]/rewards/actions";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type BusinessRewardsPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BusinessRewardsPage({
  params
}: BusinessRewardsPageProps) {
  const { slug } = await params;
  const session = await auth();
  const business = await prisma.business.findUnique({
    where: { slug },
    include: {
      rewards: {
        where: {
          isActive: true
        },
        orderBy: {
          pointsCost: "asc"
        }
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
        include: {
          tier: true
        }
      })
    : null;

  return (
    <main className="px-4 py-6 sm:px-8">
      <section className="surface rounded-[2rem] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#af5f33]">
          Rewards / {slug}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#143127]">
          {business.name} rewards catalogue
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#456356]">
          {membership
            ? `You currently have ${membership.pointsBalance} points on the ${membership.tier?.name ?? "current"} tier.`
            : "Join this business to redeem rewards with your points."}
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {business.rewards.length ? (
            business.rewards.map((reward) => {
              const canRedeem =
                membership &&
                membership.pointsBalance >= reward.pointsCost &&
                (reward.stock === null || reward.stock > 0);

              return (
                <article key={reward.id} className="rounded-[1.5rem] bg-white p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-[#143127]">{reward.title}</h2>
                      <p className="mt-2 text-sm text-[#456356]">
                        {reward.description || "No description provided."}
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-[#1d3c34]">
                      {reward.pointsCost} pts
                    </p>
                  </div>
                  <p className="mt-4 text-sm text-[#456356]">
                    Stock: {reward.stock === null ? "Unlimited" : reward.stock}
                  </p>

                  {membership ? (
                    <form action={redeemRewardAction} className="mt-5">
                      <input type="hidden" name="businessId" value={business.id} />
                      <input type="hidden" name="slug" value={business.slug} />
                      <input type="hidden" name="rewardId" value={reward.id} />
                      <button
                        type="submit"
                        disabled={!canRedeem}
                        className="rounded-full bg-[#1d3c34] px-5 py-3 text-sm font-medium text-[#f9f6f1] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {canRedeem ? "Redeem reward" : "Not enough points"}
                      </button>
                    </form>
                  ) : null}
                </article>
              );
            })
          ) : (
            <p className="text-sm text-[#456356]">No rewards published yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
