import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Plus, Search, Sparkles } from "lucide-react";

import { BusinessCard } from "@/components/business/business-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/home");
  }

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id, isActive: true },
    include: { business: true, tier: true },
    orderBy: { joinedAt: "desc" }
  });

  const totalPoints = memberships.reduce(
    (sum, membership) => sum + membership.pointsBalance,
    0
  );

  return (
    <section className="grid gap-5">
      <Card variant="hero" className="px-6 py-8 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
          Customer App
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">
          {greeting(session.user.name)}
        </h1>
        <p className="mt-2 max-w-lg text-sm text-white/80">
          You belong to <strong>{memberships.length}</strong>{" "}
          {memberships.length === 1 ? "business" : "businesses"} and have{" "}
          <strong>{totalPoints.toLocaleString()}</strong> total points in your wallet.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="gradient">
            <Link href="/wallet">
              Open wallet
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/onboard">
              <Plus className="h-4 w-4" />
              Onboard a business
            </Link>
          </Button>
        </div>
      </Card>

      <Card variant="surface" className="flex flex-wrap items-center gap-3">
        <Search className="h-4 w-4 text-ink-subtle" />
        <input
          type="search"
          placeholder="Find a business by name, suburb, or category…"
          className="input border-0 bg-transparent p-0 outline-none shadow-none"
        />
        <Chip variant="primary" size="sm">
          QR scan ready
        </Chip>
      </Card>

      {memberships.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {memberships.map((membership) => (
            <BusinessCard
              key={membership.id}
              business={{
                name: membership.business.name,
                slug: membership.business.slug,
                category: prettyCategory(membership.business.category),
                logoUrl: membership.business.logoUrl
              }}
              tier={membership.tier ? { name: membership.tier.name } : null}
              points={membership.pointsBalance}
            />
          ))}
        </div>
      ) : (
        <Card variant="outline" className="text-center">
          <Sparkles className="mx-auto h-7 w-7 text-primary" />
          <h2 className="mt-3 font-display text-xl font-semibold">
            Nothing in your wallet yet
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Scan a QR code at a participating store, open a WhatsApp join link, or
            tap a join button on a business profile to start earning points.
          </p>
        </Card>
      )}
    </section>
  );
}

function greeting(name?: string | null): string {
  const hour = new Date().getHours();
  const prefix =
    hour < 5
      ? "Still up?"
      : hour < 12
        ? "Good morning"
        : hour < 17
          ? "Good afternoon"
          : "Good evening";
  const first = name?.split(" ")[0];
  return first ? `${prefix}, ${first}` : `${prefix}`;
}

function prettyCategory(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
