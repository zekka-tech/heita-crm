import * as React from "react";

import { cn } from "@/lib/utils";

type ChipProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "navy";
  size?: "sm" | "md";
};

const variantClasses = {
  default: "chip",
  primary: "chip chip--primary",
  success: "chip chip--success",
  warning: "chip chip--warning",
  danger:
    "inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger border border-danger/20",
  navy:
    "inline-flex items-center gap-1.5 rounded-full bg-navy text-navy-foreground px-3 py-1.5 text-xs font-medium"
} satisfies Record<NonNullable<ChipProps["variant"]>, string>;

export function Chip({
  variant = "default",
  size = "md",
  className,
  children,
  ...props
}: ChipProps) {
  return (
    <span
      className={cn(
        variantClasses[variant],
        size === "sm" && "text-[0.6875rem] px-2 py-1",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

type TierName = "Bronze" | "Silver" | "Gold" | "Platinum" | string;

const tierStyle = (tier: TierName) => {
  const lower = tier.toLowerCase();
  if (lower.includes("plat")) return "bg-tier-platinum/15 text-tier-platinum";
  if (lower.includes("gold")) return "bg-tier-gold/15 text-tier-gold";
  if (lower.includes("silver")) return "bg-tier-silver/15 text-tier-silver";
  if (lower.includes("bronze")) return "bg-tier-bronze/15 text-tier-bronze";
  return "bg-ink/10 text-ink-muted";
};

export function TierBadge({
  tier,
  className
}: {
  tier?: TierName | null;
  className?: string;
}) {
  const label = tier ?? "Unranked";
  return (
    <span className={cn("tier-badge", tierStyle(label), className)}>{label}</span>
  );
}
