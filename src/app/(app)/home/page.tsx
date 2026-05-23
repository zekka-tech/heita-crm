import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/home");
  }

  const memberships = await prisma.membership.findMany({
    where: {
      userId: session.user.id
    },
    include: {
      business: true,
      tier: true
    },
    orderBy: {
      joinedAt: "desc"
    }
  });

  return (
    <section className="grid gap-4">
      <div className="surface rounded-[2rem] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#af5f33]">
          Customer App
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#143127]">
          Your business memberships
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#456356]">
          {memberships.length
            ? "All joined businesses, point balances, and current tiers live here."
            : "You have not joined any businesses yet."}
        </p>
      </div>

      {memberships.length ? (
        memberships.map((membership) => (
          <article key={membership.id} className="surface rounded-[1.5rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#143127]">
                  {membership.business.name}
                </h2>
                <p className="mt-1 text-sm text-[#456356]">
                  {membership.tier?.name ?? "Unranked"} tier
                </p>
              </div>
              <p className="text-lg font-semibold text-[#1d3c34]">
                {membership.pointsBalance} pts
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`/b/${membership.business.slug}`}
                className="rounded-full border border-[rgba(20,49,39,0.14)] px-4 py-2 text-sm text-[#143127]"
              >
                View business
              </Link>
              <Link
                href={`/b/${membership.business.slug}/chat`}
                className="rounded-full border border-[rgba(20,49,39,0.14)] px-4 py-2 text-sm text-[#143127]"
              >
                Open chat
              </Link>
            </div>
          </article>
        ))
      ) : (
        <div className="surface rounded-[1.5rem] p-5">
          <p className="text-sm text-[#456356]">
            Create a business from the dashboard or open a public join link to see the
            membership flow in action.
          </p>
        </div>
      )}
    </section>
  );
}
