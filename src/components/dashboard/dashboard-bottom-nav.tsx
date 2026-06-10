"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  BriefcaseBusiness,
  Gift,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Sparkles,
  Store,
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
  { segment: "sales", label: "Sales", icon: BriefcaseBusiness },
  { segment: "analytics", label: "Analytics", icon: BarChart2 },
  { segment: "ai-workspace", label: "AI", icon: Sparkles },
  { segment: "settings", label: "Settings", icon: Settings }
];

type Props = { businessId: string; isFranchiseHQ: boolean };

export function DashboardBottomNav({ businessId, isFranchiseHQ }: Props) {
  const pathname = usePathname();

  const items = isFranchiseHQ
    ? [...ITEMS, { segment: "franchise", label: "Franchise", icon: Store }]
    : ITEMS;

  return (
    <nav
      aria-label="Dashboard navigation"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-line bg-surface/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map(({ segment, label, icon: Icon }) => {
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
            prefetch={true}
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
      prefetch={true}
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

export function DashboardSidebarNav({ businessId, isFranchiseHQ }: Props) {
  const pathname = usePathname();

  const items = isFranchiseHQ
    ? [...ITEMS, { segment: "franchise", label: "Franchise", icon: Store }]
    : ITEMS;

  return (
    <aside className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:gap-1 lg:border-r lg:border-line lg:bg-surface lg:px-3 lg:py-6">
      {items.map(({ segment, label, icon }) => {
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

    </aside>
  );
}
