import type { Route } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Crumb = { label: string; href?: string };

export function Breadcrumb({ crumbs, className }: { crumbs: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1 text-sm text-ink-muted", className)}>
      {crumbs.map((crumb, i) => (
        <span key={crumb.label} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-ink-subtle" aria-hidden="true" />}
          {crumb.href && i < crumbs.length - 1 ? (
            <Link href={crumb.href as Route} className="hover:text-ink underline underline-offset-2 transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className={cn(i === crumbs.length - 1 ? "text-ink font-medium" : "")} aria-current={i === crumbs.length - 1 ? "page" : undefined}>
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
