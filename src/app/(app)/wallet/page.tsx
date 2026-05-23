import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function WalletPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/wallet");
  }

  const memberships = await prisma.membership.findMany({
    where: {
      userId: session.user.id
    },
    include: {
      business: true,
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
  });

  const totalPoints = memberships.reduce((sum, membership) => sum + membership.pointsBalance, 0);

  return (
    <section className="grid gap-4">
      <div className="surface rounded-[2rem] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#af5f33]">
          Customer App
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#143127]">
          Points and rewards wallet
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#456356]">
          Total points across all memberships: {totalPoints}
        </p>
      </div>

      {memberships.map((membership) => (
        <article key={membership.id} className="surface rounded-[1.5rem] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#143127]">
                {membership.business.name}
              </h2>
              <p className="mt-1 text-sm text-[#456356]">
                Tier: {membership.tier?.name ?? "Unranked"}
              </p>
            </div>
            <p className="text-xl font-semibold text-[#1d3c34]">
              {membership.pointsBalance} pts
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/b/${membership.business.slug}/rewards`}
              className="rounded-full border border-[rgba(20,49,39,0.14)] px-4 py-2 text-sm text-[#143127]"
            >
              View rewards
            </Link>
            <Link
              href={`/b/${membership.business.slug}`}
              className="rounded-full border border-[rgba(20,49,39,0.14)] px-4 py-2 text-sm text-[#143127]"
            >
              Open business
            </Link>
          </div>

          <div className="mt-5 border-t border-[rgba(20,49,39,0.08)] pt-4">
            <h3 className="text-sm font-semibold text-[#143127]">Recent activity</h3>
            <div className="mt-3 grid gap-2">
              {membership.transactions.length ? (
                membership.transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm"
                  >
                    <span className="text-[#456356]">
                      {transaction.description || transaction.type}
                    </span>
                    <span
                      className={
                        transaction.pointsDelta >= 0 ? "text-[#1d3c34]" : "text-[#af5f33]"
                      }
                    >
                      {transaction.pointsDelta >= 0 ? "+" : ""}
                      {transaction.pointsDelta}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#456356]">No loyalty activity yet.</p>
              )}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
