import Link from "next/link";
import { JoinChannel } from "@prisma/client";
import { notFound } from "next/navigation";

import { joinBusinessAction } from "@/app/b/[slug]/join/actions";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type BusinessJoinPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ channel?: string }>;
};

export default async function BusinessJoinPage({
  params,
  searchParams
}: BusinessJoinPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const session = await auth();
  const business = await prisma.business.findUnique({
    where: { slug }
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
        }
      })
    : null;

  const channel = Object.values(JoinChannel).includes(
    resolvedSearchParams.channel as JoinChannel
  )
    ? (resolvedSearchParams.channel as JoinChannel)
    : JoinChannel.DIRECT_LINK;

  return (
    <main className="px-4 py-6 sm:px-8">
      <section className="surface mx-auto max-w-2xl rounded-[2rem] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#af5f33]">
          Join / {slug}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#143127]">
          Join {business.name}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#456356]">
          This membership gives the customer one shared wallet for points, rewards,
          promotions, and AI chat with {business.name}.
        </p>

        {membership ? (
          <div className="mt-8 rounded-[1.5rem] bg-white p-5">
            <p className="text-sm font-semibold text-[#143127]">
              You already belong to this loyalty programme.
            </p>
            <p className="mt-2 text-sm text-[#456356]">
              Current points balance: {membership.pointsBalance}
            </p>
          </div>
        ) : session?.user?.id ? (
          <form action={joinBusinessAction} className="mt-8 grid gap-4">
            <input type="hidden" name="businessId" value={business.id} />
            <input type="hidden" name="slug" value={business.slug} />
            <input type="hidden" name="channel" value={channel} />
            <button
              type="submit"
              className="rounded-full bg-[#1d3c34] px-5 py-3 text-sm font-medium text-[#f9f6f1]"
            >
              Join and claim {business.loyaltySignupBonus} welcome points
            </button>
          </form>
        ) : (
          <div className="mt-8">
            <Link
              href={`/sign-in?callbackUrl=/b/${business.slug}/join`}
              className="inline-flex rounded-full bg-[#1d3c34] px-5 py-3 text-sm font-medium text-[#f9f6f1]"
            >
              Sign in to join
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
