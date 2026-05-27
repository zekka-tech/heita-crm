import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Chip, TierBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BusinessCardProps = {
  business: {
    name: string;
    slug: string;
    category?: string | null;
    logoUrl?: string | null;
  };
  tier?: { name: string } | null;
  points?: number;
  labels?: {
    points?: string;
    viewBusiness?: string;
    rewards?: string;
    openChat?: string;
    history?: string;
  };
  className?: string;
};

export function BusinessCard({
  business,
  tier,
  points,
  labels,
  className
}: BusinessCardProps) {
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl bg-surface border border-line p-5 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg",
        className
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white text-lg font-display font-bold shadow-glow">
          {business.logoUrl ? (
            <Image
              src={business.logoUrl}
              alt=""
              width={56}
              height={56}
              className="h-full w-full rounded-2xl object-cover"
            />
          ) : (
            initials(business.name)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-lg font-semibold text-ink">
              {business.name}
            </h3>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {business.category ? (
              <Chip variant="primary" size="sm">
                {business.category}
              </Chip>
            ) : null}
            <TierBadge tier={tier?.name} />
          </div>
        </div>
        <div className="text-right shrink-0">
          {typeof points === "number" ? (
            <>
              <p className="metric-value">{points.toLocaleString()}</p>
              <p className="metric-label">{labels?.points ?? "points"}</p>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={`/b/${business.slug}`}
          className="btn btn--ghost btn--ghost-compact"
        >
          {labels?.viewBusiness ?? "View business"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href={`/b/${business.slug}/rewards`}
          className="btn btn--secondary btn--ghost-compact"
        >
          {labels?.rewards ?? "Rewards"}
        </Link>
        <Link
          href={`/b/${business.slug}/chat`}
          className="btn btn--secondary btn--ghost-compact"
        >
          {labels?.openChat ?? "Open chat"}
        </Link>
        <Link
          href={`/b/${business.slug}/history`}
          className="btn btn--secondary btn--ghost-compact"
        >
          {labels?.history ?? "History"}
        </Link>
      </div>
    </article>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
