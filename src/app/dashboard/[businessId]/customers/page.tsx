import { notFound, redirect } from "next/navigation";
import { Search, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { TierBadge } from "@/components/ui/badge";
import { isBuildPhase } from "@/lib/build-phase";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ q?: string; page?: string }>;
};

const PAGE_SIZE = 30;

const JOIN_CHANNEL_LABEL: Record<string, string> = {
  QR_CODE: "QR",
  WHATSAPP_BOT: "WhatsApp",
  DIRECT_LINK: "Link",
  STAFF_INVITE: "Invite",
  CSV_IMPORT: "Import",
  GOOGLE_SIGNIN: "Google",
  APPLE_SIGNIN: "Apple"
};

export default async function CustomersPage({ params, searchParams }: Props) {
  const { businessId } = await params;

  if (isBuildPhase()) {
    return <main className="px-4 pb-24 pt-6 sm:px-8" />;
  }

  const [{ auth }, { prisma }] = await Promise.all([
    import("@/lib/auth"),
    import("@/lib/prisma")
  ]);

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/customers`);
  }

  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      deletedAt: null,
      staffMembers: { some: { userId: session.user.id } }
    },
    select: { id: true, name: true }
  });

  if (!business) notFound();

  const resolved = searchParams ? await searchParams : {};
  const q = (resolved.q ?? "").trim();
  const page = Math.max(1, parseInt(resolved.page ?? "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const where = {
    businessId,
    isActive: true,
    ...(q
      ? {
          user: {
            deletedAt: null,
            OR: [
              { phone: { contains: q } },
              { name: { contains: q, mode: "insensitive" as const } }
            ]
          }
        }
      : { user: { deletedAt: null } })
  };

  const [members, total] = await Promise.all([
    prisma.membership.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, phone: true } },
        tier: { select: { name: true } }
      },
      orderBy: { joinedAt: "desc" },
      skip,
      take: PAGE_SIZE
    }),
    prisma.membership.count({ where })
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Users className="h-6 w-6 text-primary-action" aria-hidden />
        <div>
          <h1 className="text-xl font-bold text-ink">Members</h1>
          <p className="text-sm text-ink-muted">
            {total.toLocaleString()} active member{total !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Search */}
      <form method="GET" className="mb-6">
        <div className="relative max-w-md">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name or phone…"
            className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-4 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary-action/40"
            aria-label="Search members"
          />
        </div>
      </form>

      {/* Member list */}
      {members.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <Users className="h-8 w-8 text-ink-muted" aria-hidden />
          <p className="font-medium text-ink">
            {q ? "No members match your search" : "No members yet"}
          </p>
          {!q && (
            <p className="text-sm text-ink-muted">
              Members will appear here once customers join your loyalty programme.
            </p>
          )}
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-surface-elevated">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-ink">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-ink">Phone</th>
                <th className="px-4 py-3 text-left font-semibold text-ink">Tier</th>
                <th className="px-4 py-3 text-right font-semibold text-ink">Points</th>
                <th className="px-4 py-3 text-left font-semibold text-ink">Joined via</th>
                <th className="px-4 py-3 text-left font-semibold text-ink">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-surface-elevated">
                  <td className="px-4 py-3 font-medium text-ink">
                    {m.user.name ?? <span className="text-ink-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{m.user.phone}</td>
                  <td className="px-4 py-3">
                    {m.tier ? (
                      <TierBadge tier={m.tier.name} />
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">
                    {m.pointsBalance.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {JOIN_CHANNEL_LABEL[m.joinChannel] ?? m.joinChannel}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {new Date(m.joinedAt).toLocaleDateString("en-ZA", {
                      day: "numeric",
                      month: "short",
                      year: "numeric"
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`?q=${encodeURIComponent(q)}&page=${page - 1}`}
                className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-elevated"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`?q=${encodeURIComponent(q)}&page=${page + 1}`}
                className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-elevated"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
