"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, Home, User, Wallet } from "lucide-react";

import { useTRPC } from "@/components/providers/trpc-provider";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const items: { href: Route; labelKey: string; icon: typeof Home; showBadge?: boolean }[] = [
  { href: "/home", labelKey: "home", icon: Home },
  { href: "/wallet", labelKey: "wallet", icon: Wallet },
  { href: "/notifications", labelKey: "alerts", icon: Bell, showBadge: true },
  { href: "/profile", labelKey: "profile", icon: User }
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("bottomNav");
  const trpc = useTRPC();

  const { data: unreadData } = useQuery(
    trpc.notifications.unreadCount.queryOptions(undefined, {
      refetchInterval: 60_000,
      staleTime: 30_000
    })
  );
  const unreadCount = unreadData?.count ?? 0;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-md justify-around gap-1 rounded-full border border-line bg-surface/95 px-2 py-2 shadow-lg backdrop-blur sm:left-1/2 sm:right-auto sm:w-[28rem] sm:-translate-x-1/2"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
    >
      {items.map(({ href, labelKey, icon: Icon, showBadge }) => {
        const label = t(labelKey);
        const active =
          pathname === href ||
          (typeof pathname === "string" && pathname.startsWith(`${href}/`));
        const badgeCount = showBadge ? unreadCount : 0;
        return (
          <Link
            key={href}
            href={href}
            prefetch={true}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 rounded-full px-3 py-3 text-[0.6875rem] font-semibold transition",
              active
                ? "bg-primary text-white shadow-glow"
                : "text-ink-muted hover:bg-surface-elevated hover:text-ink"
            )}
          >
            <span className="relative">
              <Icon className="h-4 w-4" strokeWidth={active ? 2.5 : 1.8} />
              {badgeCount > 0 && (
                <span
                  className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-0.5 text-[0.5625rem] font-bold text-white"
                  aria-label={`${badgeCount} unread`}
                >
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
