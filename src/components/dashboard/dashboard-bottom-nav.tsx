"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  Gift,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Sparkles,
  Users
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = {
  segment: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const ITEMS: NavItem[] = [
  { segment: "", label: "Home", icon: LayoutDashboard },
  { segment: "loyalty", label: "Loyalty", icon: Gift },
  { segment: "customers", label: "Members", icon: Users },
  { segment: "messages", label: "Messages", icon: MessageSquare },
  { segment: "ai-workspace", label: "AI", icon: Sparkles },
  { segment: "settings", label: "Settings", icon: Settings }
];

type Props = { businessId: string };

export function DashboardBottomNav({ businessId }: Props) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard navigation"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-line bg-surface/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {ITEMS.map(({ segment, label, icon: Icon }) => {
        const href: Route =
          segment === ""
            ? (`/dashboard/${businessId}` as Route)
            : (`/dashboard/${businessId}/${segment}` as Route);

        const active =
          segment === ""
            ? pathname === `/dashboard/${businessId}`
            : (pathname ?? "").startsWith(`/dashboard/${businessId}/${segment}`);

        return (
          <Link
            key={segment || "home"}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-3 text-[0.625rem] font-semibold transition-colors",
              active
                ? "text-primary-action"
                : "text-ink-muted hover:text-ink"
            )}
          >
            <Icon
              className="h-5 w-5"
              strokeWidth={active ? 2.5 : 1.8}
              aria-hidden
            />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

type SidebarItem = NavItem & { active: boolean; href: Route };

function SidebarNavItem({ label, icon: Icon, active, href }: SidebarItem) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary-action"
          : "text-ink-muted hover:bg-surface-elevated hover:text-ink"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.5 : 1.8} aria-hidden />
      {label}
    </Link>
  );
}

export function DashboardSidebarNav({ businessId }: Props) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:gap-1 lg:border-r lg:border-line lg:bg-surface lg:px-3 lg:py-6">
      {ITEMS.map(({ segment, label, icon }) => {
        const href: Route =
          segment === ""
            ? (`/dashboard/${businessId}` as Route)
            : (`/dashboard/${businessId}/${segment}` as Route);

        const active =
          segment === ""
            ? pathname === `/dashboard/${businessId}`
            : (pathname ?? "").startsWith(`/dashboard/${businessId}/${segment}`);

        return (
          <SidebarNavItem
            key={segment || "home"}
            segment={segment}
            label={label}
            icon={icon}
            active={active}
            href={href}
          />
        );
      })}

      <div className="mt-auto pt-4">
        <Link
          href={`/dashboard/${businessId}/analytics` as Route}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-elevated hover:text-ink"
        >
          <BarChart2 className="h-4 w-4 shrink-0" aria-hidden />
          Analytics
        </Link>
      </div>
    </aside>
  );
}
