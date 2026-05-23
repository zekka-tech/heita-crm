import type { Route } from "next";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

type BusinessLandingPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BusinessLandingPage({
  params
}: BusinessLandingPageProps) {
  const { slug } = await params;
  const business = await prisma.business.findUnique({
    where: { slug },
    include: {
      rewards: {
        where: { isActive: true },
        take: 3
      },
      promotions: {
        where: { isActive: true },
        take: 3
      },
      events: {
        orderBy: { startsAt: "asc" },
        take: 3
      }
    }
  });

  if (!business) {
    notFound();
  }

  return (
    <main className="px-4 py-6 sm:px-8">
      <section className="surface rounded-[2rem] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#af5f33]">
          Business / {business.slug}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#143127]">
          {business.name}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#456356]">
          {business.description || "Join this loyalty programme to start earning points and rewards."}
        </p>
        <div className="mt-6">
          <a
            href={`/b/${slug}/join` as Route}
            className="inline-flex rounded-full bg-[#1d3c34] px-5 py-3 text-sm font-medium text-[#f9f6f1]"
          >
            Join loyalty programme
          </a>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <article className="rounded-[1.5rem] bg-white p-5">
            <h2 className="text-sm font-semibold text-[#143127]">Rewards</h2>
            <p className="mt-2 text-sm text-[#456356]">
              {business.rewards.length
                ? business.rewards.map((reward) => reward.title).join(", ")
                : "No rewards published yet."}
            </p>
          </article>
          <article className="rounded-[1.5rem] bg-white p-5">
            <h2 className="text-sm font-semibold text-[#143127]">Promotions</h2>
            <p className="mt-2 text-sm text-[#456356]">
              {business.promotions.length
                ? business.promotions.map((promotion) => promotion.title).join(", ")
                : "No active promotions."}
            </p>
          </article>
          <article className="rounded-[1.5rem] bg-white p-5">
            <h2 className="text-sm font-semibold text-[#143127]">Events</h2>
            <p className="mt-2 text-sm text-[#456356]">
              {business.events.length
                ? business.events.map((event) => event.title).join(", ")
                : "No upcoming events."}
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
