import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { BusinessCard } from "@/components/business/business-card";
import { Card } from "@/components/ui/card";
import { Chip, TierBadge } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Wallet" };

export default async function WalletPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/wallet");
  }

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id, isActive: true },
    include: {
      business: true,
      tier: true,
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 5
      }
    },
    orderBy: { joinedAt: "desc" }
  });

  const totalPoints = memberships.reduce((sum, m) => sum + m.pointsBalance, 0);

  return (
    <section className="grid gap-5">
      <Card variant="hero" className="px-6 py-8 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
          Wallet
        </p>
        <p className="mt-3 font-display text-5xl font-extrabold tracking-tight">
          {totalPoints.toLocaleString()}
        </p>
        <p className="mt-1 text-white/75">
          total points across {memberships.length}{" "}
          {memberships.length === 1 ? "business" : "businesses"}
        </p>
      </Card>

      {memberships.length === 0 ? (
        <Card variant="outline" className="text-center">
          <Sparkles className="mx-auto h-7 w-7 text-primary" />
          <p className="mt-3 text-ink-muted">
            Join a business to see your points and rewards here.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {memberships.map((membership) => (
          <div key={membership.id} className="space-y-3">
            <BusinessCard
              business={{
                name: membership.business.name,
                slug: membership.business.slug,
                category: membership.business.category
              }}
              tier={membership.tier ? { name: membership.tier.name } : null}
              points={membership.pointsBalance}
            />
            <Card variant="outline" className="space-y-3">
              <header className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-ink-muted">
                  Recent activity
                </h3>
                <TierBadge tier={membership.tier?.name} />
              </header>
              {membership.transactions.length ? (
                <ul className="space-y-2">
                  {membership.transactions.map((transaction) => (
                    <li
                      key={transaction.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-elevated px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-ink">
                          {transaction.description ?? transaction.type}
                        </p>
                        <p className="text-xs text-ink-subtle">
                          {transaction.createdAt.toLocaleDateString("en-ZA", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric"
                          })}
                        </p>
                      </div>
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
              ) : (
                <p className="text-sm text-ink-subtle">No activity yet.</p>
              )}
            </Card>
          </div>
        ))}
      </div>
    </section>
  );
}
