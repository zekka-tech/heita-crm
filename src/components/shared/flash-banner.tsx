"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { Route } from "next";
import { X } from "lucide-react";

const FLASH_MESSAGES: Record<string, string> = {
  joined: "You've joined successfully! Your loyalty points will appear shortly.",
  redeemed: "Reward redeemed! Check your wallet for the updated balance.",
  email_verified: "Your email address has been verified.",
  profile_updated: "Profile updated successfully.",
  invite_accepted: "You've joined the team!"
};

export function FlashBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const flash = searchParams?.get("flash");
    if (flash && FLASH_MESSAGES[flash]) {
      setMessage(FLASH_MESSAGES[flash]);
      // Remove the ?flash= param from the URL without a navigation
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("flash");
      const newUrl = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
      router.replace(newUrl as Route, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
    >
      <span>{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setMessage(null)}
        className="shrink-0 rounded p-0.5 hover:bg-success/20"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
