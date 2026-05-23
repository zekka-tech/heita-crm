"use client";

import type { Route } from "next";
import Link from "next/link";
import { Bell, Home, Trophy, User } from "lucide-react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  { href: "/home" as Route, label: "Home", icon: Home },
  { href: "/wallet" as Route, label: "Wallet", icon: Trophy },
  { href: "/notifications" as Route, label: "Alerts", icon: Bell },
  { href: "/profile" as Route, label: "Profile", icon: User }
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="surface fixed inset-x-4 bottom-4 z-20 rounded-full px-3 py-2 sm:left-1/2 sm:right-auto sm:w-[24rem] sm:-translate-x-1/2">
      <ul className="grid grid-cols-4 gap-2">
        {items.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;

          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center rounded-2xl px-3 py-2 text-xs font-medium transition",
                  active ? "bg-[#1d3c34] text-[#f9f6f1]" : "text-[#456356] hover:bg-[#f5efe3]"
                )}
              >
                <Icon className="mb-1 h-4 w-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
