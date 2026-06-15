import type { Route } from "next";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { withBusinessScope } from "@/lib/prisma";

type MembershipCtaProps = {
  slug: string;
  businessId: string;
  loyaltySignupBonus: number;
};

/**
 * Server component that reads the session and renders auth-dependent CTAs
 * (join/view-rewards button, staff chat link). Runs inside a <Suspense>
 * boundary in the parent page so the static ISR shell can be served from
 * the CDN cache while this component streams in per-request.
 */
export async function MembershipCta({
  slug,
  businessId,
  loyaltySignupBonus
}: MembershipCtaProps) {
  const t = await getTranslations("businessProfile");
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [membership, staffMember] = userId
    ? await Promise.all([
        withBusinessScope(businessId, (tx) =>
          tx.membership.findUnique({
            where: { businessId_userId: { businessId, userId } },
            include: { tier: true }
          })
        ),
        withBusinessScope(businessId, (tx) =>
          tx.staffMember.findUnique({
            where: { businessId_userId: { businessId, userId } },
            select: { id: true }
          })
        )
      ])
    : [null, null];

  const isStaff = Boolean(staffMember);

  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Button asChild variant="gradient" size="lg">
        <Link
          href={
            membership
              ? (`/b/${slug}/rewards` as Route)
              : (`/b/${slug}/join` as Route)
          }
        >
          {membership
            ? t("viewRewards")
            : t("joinWithBonus", { points: loyaltySignupBonus })}
        </Link>
      </Button>
      {isStaff ? (
        <Button asChild variant="secondary" size="lg">
          <Link href={`/b/${slug}/chat` as Route}>
            <MessageSquare className="h-4 w-4" />
            {t("talkToTeam")}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The glass stats card that appears in the hero grid (top-right on desktop).
 * Renders personalised membership stats when signed in, or the "free to join"
 * welcome-points teaser for anonymous visitors.
 * Runs inside a <Suspense> boundary — streams in after the static shell.
 */
export async function MembershipCard({
  businessId,
  loyaltySignupBonus
}: {
  businessId: string;
  loyaltySignupBonus: number;
}) {
  const t = await getTranslations("businessProfile");
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const membership = userId
    ? await withBusinessScope(businessId, (tx) =>
        tx.membership.findUnique({
          where: { businessId_userId: { businessId, userId } },
          include: { tier: true }
        })
      )
    : null;

  if (membership) {
    return (
      <>
        <p className="eyebrow text-primary-action">{t("yourMembership")}</p>
        <p className="metric-value mt-3">
          {membership.pointsBalance.toLocaleString()}
        </p>
        <p className="metric-label">{t("pointsLabel")}</p>
        <p className="mt-4 text-sm text-ink-muted">
          {t("currentTier")} {" "}
          <span className="font-semibold text-ink">
            {membership.tier?.name ?? t("unranked")}
          </span>
        </p>
      </>
    );
  }

  return (
    <>
      <p className="eyebrow text-primary-action">{t("freeToJoin")}</p>
      <p className="metric-value mt-3">{loyaltySignupBonus}</p>
      <p className="metric-label">{t("welcomePoints")}</p>
      <p className="mt-4 text-sm text-ink-muted">{t("joinPrompt")}</p>
    </>
  );
}
