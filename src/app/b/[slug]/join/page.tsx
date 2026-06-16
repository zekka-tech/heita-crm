import type { Route } from "next";
import Link from "next/link";
import { JoinChannel } from "@prisma/client";
import { notFound } from "next/navigation";
import { BadgeCheck, CheckCircle2, Gift, MessageCircle, QrCode } from "lucide-react";

import { joinBusinessAction } from "@/app/b/[slug]/join/actions";
import { CsrfField } from "@/components/security/csrf-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { isBuildPhase } from "@/lib/build-phase";

export const dynamic = "force-dynamic";

type BusinessJoinPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    channel?: string;
    ref?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  }>;
};

export default async function BusinessJoinPage({
  params,
  searchParams
}: BusinessJoinPageProps) {
  const { slug } = await params;

  if (isBuildPhase()) {
    return <main className="px-4 py-6 sm:px-8" />;
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const [{ auth }, { prisma, withBusinessScope }] = await Promise.all([
    import("@/lib/auth"),
    import("@/lib/prisma")
  ]);
  const session = await auth();
  const business = await prisma.business.findFirst({
    where: { slug, deletedAt: null }
  }).catch(() => null);

  if (!business) notFound();

  const membership = session?.user?.id
    ? await withBusinessScope(business.id, (tx) =>
        tx.membership.findUnique({
          where: {
            businessId_userId: {
              businessId: business.id,
              userId: session.user.id
            }
          }
        })
      )
    : null;

  const channel = Object.values(JoinChannel).includes(
    resolvedSearchParams.channel as JoinChannel
  )
    ? (resolvedSearchParams.channel as JoinChannel)
    : JoinChannel.DIRECT_LINK;
  const referralCode = resolvedSearchParams.ref?.trim().toUpperCase() ?? "";
  const utmSource = resolvedSearchParams.utm_source?.trim() ?? "";
  const utmMedium = resolvedSearchParams.utm_medium?.trim() ?? "";
  const utmCampaign = resolvedSearchParams.utm_campaign?.trim() ?? "";

  return (
    <main className="px-4 py-6 sm:px-8">
      <Breadcrumb
        crumbs={[
          { label: "Discover", href: "/discover" },
          { label: business.name, href: `/b/${business.slug}` },
          { label: "Join" }
        ]}
        className="mb-4"
      />
      <Card variant="surface" className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-3">
          <Chip variant="primary" size="sm">
            <QrCode className="h-3 w-3" /> Join via {prettyChannel(channel)}
          </Chip>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
            Join {business.name}
          </h1>
          <p className="text-sm leading-6 text-ink-muted">
            Get one wallet across every business you join. Earn points at every
            visit, redeem rewards, and chat with the team.
          </p>
        </header>

        <ul className="grid gap-2">
          {[
            {
              icon: Gift,
              text: `Welcome bonus of ${business.loyaltySignupBonus} points on sign-up`
            },
            { icon: BadgeCheck, text: "Auto tier progression as you earn" },
            { icon: MessageCircle, text: "Direct WhatsApp + in-app updates" }
          ].map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="flex items-center gap-3 rounded-xl bg-surface-elevated px-3 py-2.5 text-sm text-ink"
            >
              <Icon className="h-4 w-4 text-primary-action" />
              {text}
            </li>
          ))}
        </ul>

        {membership ? (
          <Card variant="outline" className="bg-accent/5">
            <CheckCircle2 className="h-6 w-6 text-success" />
            <h2 className="mt-2 font-display text-lg font-semibold">
              You&apos;re already a member.
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Current balance:{" "}
              <strong>{membership.pointsBalance.toLocaleString()} points</strong>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="primary">
                <Link href={`/b/${business.slug}/rewards` as Route}>
                  See rewards
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/wallet">Open wallet</Link>
              </Button>
            </div>
          </Card>
        ) : session?.user?.id ? (
          <form action={joinBusinessAction} className="grid gap-4">
            <CsrfField />
            <input type="hidden" name="businessId" value={business.id} />
            <input type="hidden" name="slug" value={business.slug} />
            <input type="hidden" name="channel" value={channel} />
            <input type="hidden" name="referralCode" value={referralCode} />
            <input type="hidden" name="utmSource" value={utmSource} />
            <input type="hidden" name="utmMedium" value={utmMedium} />
            <input type="hidden" name="utmCampaign" value={utmCampaign} />
            <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-elevated px-3 py-3 text-sm text-ink">
              <input
                type="checkbox"
                name="marketingConsent"
                value="true"
                className="mt-1 h-4 w-4 rounded border-line"
              />
              <span>
                I consent to receive WhatsApp loyalty updates and offers from {business.name}.
              </span>
            </label>
            <Button type="submit" variant="gradient" size="lg">
              Claim {business.loyaltySignupBonus} welcome points
            </Button>
          </form>
        ) : (
          <Button asChild variant="primary" size="lg">
            <Link
              href={`/sign-in?callbackUrl=${encodeURIComponent(`/b/${business.slug}/join${channel ? `?channel=${channel}` : ""}`)}`}
            >
              Sign in to join
            </Link>
          </Button>
        )}
      </Card>
    </main>
  );
}

function prettyChannel(channel: JoinChannel) {
  return channel
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
