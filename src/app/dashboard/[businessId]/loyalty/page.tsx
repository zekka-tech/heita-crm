import { notFound, redirect } from "next/navigation";

import {
  createRewardAction,
  earnPointsAction,
  redeemPointsAction
} from "@/app/dashboard/[businessId]/loyalty/actions";
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
      staffMembers: {
        some: {
          userId: session.user.id
        }
      }
    },
    include: {
      memberships: {
        include: {
          user: true,
          tier: true,
          transactions: {
            orderBy: {
              createdAt: "desc"
            },
            take: 3
          }
        },
        orderBy: {
          joinedAt: "desc"
        }
      },
      rewards: {
        orderBy: {
          createdAt: "desc"
        }
      },
      loyaltyTiers: {
        orderBy: {
          minPoints: "asc"
        }
      }
    }
  });

  if (!business) {
    notFound();
  }

  return (
    <main className="px-4 py-6 sm:px-8">
      <div className="grid gap-4">
        <section className="surface rounded-[2rem] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#af5f33]">
            Loyalty / {business.name}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#143127]">
            Loyalty engine controls
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#456356]">
            Manage point issuance, redemptions, reward inventory, and tier progression.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm text-[#456356]">
            {business.loyaltyTiers.map((tier) => (
              <span key={tier.id} className="rounded-full bg-white px-4 py-2">
                {tier.name}: {tier.minPoints}+ pts
              </span>
            ))}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="surface rounded-[1.5rem] p-5">
            <h2 className="text-lg font-semibold text-[#143127]">Manual point earn</h2>
            <form action={earnPointsAction} className="mt-4 grid gap-3">
              <input type="hidden" name="businessId" value={business.id} />
              <select
                name="membershipId"
                className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
                defaultValue=""
                required
              >
                <option value="" disabled>
                  Select customer membership
                </option>
                {business.memberships.map((membership) => (
                  <option key={membership.id} value={membership.id}>
                    {membership.user.phone ?? membership.user.name ?? membership.user.id} -{" "}
                    {membership.pointsBalance} pts
                  </option>
                ))}
              </select>
              <input
                name="points"
                type="number"
                min="1"
                placeholder="Points to add"
                className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
                required
              />
              <input
                name="description"
                placeholder="Description"
                className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
              />
              <button className="rounded-full bg-[#1d3c34] px-5 py-3 text-sm font-medium text-[#f9f6f1]">
                Earn points
              </button>
            </form>
          </section>

          <section className="surface rounded-[1.5rem] p-5">
            <h2 className="text-lg font-semibold text-[#143127]">Manual point redeem</h2>
            <form action={redeemPointsAction} className="mt-4 grid gap-3">
              <input type="hidden" name="businessId" value={business.id} />
              <select
                name="membershipId"
                className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
                defaultValue=""
                required
              >
                <option value="" disabled>
                  Select customer membership
                </option>
                {business.memberships.map((membership) => (
                  <option key={membership.id} value={membership.id}>
                    {membership.user.phone ?? membership.user.name ?? membership.user.id} -{" "}
                    {membership.pointsBalance} pts
                  </option>
                ))}
              </select>
              <input
                name="points"
                type="number"
                min="1"
                placeholder="Points to redeem"
                className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
                required
              />
              <input
                name="description"
                placeholder="Description"
                className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
              />
              <button className="rounded-full bg-[#af5f33] px-5 py-3 text-sm font-medium text-[#f9f6f1]">
                Redeem points
              </button>
            </form>
          </section>
        </div>

        <section className="surface rounded-[1.5rem] p-5">
          <h2 className="text-lg font-semibold text-[#143127]">Reward catalogue</h2>
          <form action={createRewardAction} className="mt-4 grid gap-3 md:grid-cols-4">
            <input type="hidden" name="businessId" value={business.id} />
            <input
              name="title"
              placeholder="Reward title"
              className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
              required
            />
            <input
              name="pointsCost"
              type="number"
              min="1"
              placeholder="Points cost"
              className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
              required
            />
            <input
              name="stock"
              type="number"
              min="0"
              placeholder="Stock"
              className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
            />
            <button className="rounded-full bg-[#1d3c34] px-5 py-3 text-sm font-medium text-[#f9f6f1]">
              Add reward
            </button>
            <textarea
              name="description"
              placeholder="Reward description"
              className="md:col-span-4 rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
              rows={3}
            />
          </form>

          <div className="mt-5 grid gap-3">
            {business.rewards.length ? (
              business.rewards.map((reward) => (
                <div key={reward.id} className="rounded-2xl bg-white px-4 py-4 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-[#143127]">{reward.title}</p>
                      <p className="mt-1 text-[#456356]">
                        {reward.description || "No description"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[#1d3c34]">{reward.pointsCost} pts</p>
                      <p className="text-[#456356]">
                        Stock: {reward.stock === null ? "Unlimited" : reward.stock}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#456356]">No rewards created yet.</p>
            )}
          </div>
        </section>

        <section className="surface rounded-[1.5rem] p-5">
          <h2 className="text-lg font-semibold text-[#143127]">Customer memberships</h2>
          <div className="mt-4 grid gap-3">
            {business.memberships.length ? (
              business.memberships.map((membership) => (
                <article key={membership.id} className="rounded-2xl bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-[#143127]">
                        {membership.user.phone ?? membership.user.name ?? membership.user.id}
                      </p>
                      <p className="mt-1 text-sm text-[#456356]">
                        Tier: {membership.tier?.name ?? "Unranked"}
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-[#1d3c34]">
                      {membership.pointsBalance} pts
                    </p>
                  </div>
                  <div className="mt-4 grid gap-2">
                    {membership.transactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="flex items-center justify-between rounded-2xl border border-[rgba(20,49,39,0.08)] px-3 py-2 text-sm"
                      >
                        <span className="text-[#456356]">
                          {transaction.description || transaction.type}
                        </span>
                        <span
                          className={
                            transaction.pointsDelta >= 0
                              ? "text-[#1d3c34]"
                              : "text-[#af5f33]"
                          }
                        >
                          {transaction.pointsDelta >= 0 ? "+" : ""}
                          {transaction.pointsDelta}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm text-[#456356]">No customer memberships yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
