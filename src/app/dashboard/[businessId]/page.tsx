import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type DashboardPageProps = {
  params: Promise<{ businessId: string }>;
};

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { businessId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}`);
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
      qrCodes: {
        orderBy: {
          createdAt: "asc"
        },
        take: 1
      },
      joinLinks: {
        orderBy: {
          createdAt: "asc"
        },
        take: 1
      },
      memberships: true
    }
  });

  if (!business) {
    notFound();
  }

  const primaryQr = business.qrCodes[0] ?? null;
  const primaryLink = business.joinLinks[0] ?? null;

  return (
    <main className="px-4 py-6 sm:px-8">
      <section className="surface rounded-[2rem] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#af5f33]">
          Dashboard / {business.slug}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#143127]">
          {business.name}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#456356]">
          {business.memberships.length} customer memberships currently linked to this
          business.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <article className="rounded-[1.5rem] bg-white p-5">
            <h2 className="text-sm font-semibold text-[#143127]">Public page</h2>
            <Link href={`/b/${business.slug}`} className="mt-3 block text-sm text-[#1d3c34]">
              /b/{business.slug}
            </Link>
          </article>
          <article className="rounded-[1.5rem] bg-white p-5">
            <h2 className="text-sm font-semibold text-[#143127]">Primary join link</h2>
            <p className="mt-3 break-all text-sm text-[#456356]">
              {primaryLink
                ? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/join/${primaryLink.token}`
                : "Not configured"}
            </p>
          </article>
          <article className="rounded-[1.5rem] bg-white p-5">
            <h2 className="text-sm font-semibold text-[#143127]">QR asset URL</h2>
            <p className="mt-3 break-all text-sm text-[#456356]">
              {primaryQr
                ? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/qr/${primaryQr.token}`
                : "Not configured"}
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
