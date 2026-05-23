import type { Route } from "next";
import Link from "next/link";

import { cn } from "@/lib/utils";

type MobileHeaderProps = {
  title: string;
  subtitle?: string;
  backHref?: Route | URL;
  action?: React.ReactNode;
  className?: string;
};

export function MobileHeader({
  title,
  subtitle,
  backHref,
  action,
  className
}: MobileHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 -mx-4 mb-4 flex items-center justify-between gap-3 border-b border-line bg-surface/85 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-sm hover:bg-surface-elevated"
          >
            ‹
          </Link>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-semibold text-ink">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-xs text-ink-subtle">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
