import * as React from "react";

import { cn } from "@/lib/utils";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  as?: "div" | "article" | "section";
  variant?: "surface" | "glass" | "hero" | "outline";
};

const variantClasses = {
  surface: "surface p-6",
  glass: "surface-glass rounded-2xl p-6",
  hero: "surface-hero p-8",
  outline:
    "rounded-2xl border border-line bg-surface p-6 shadow-none"
} satisfies Record<NonNullable<CardProps["variant"]>, string>;

export function Card({
  as = "div",
  variant = "surface",
  className,
  children,
  ...props
}: CardProps) {
  const Tag = as;
  return (
    <Tag className={cn(variantClasses[variant], className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  eyebrow,
  title,
  description,
  action,
  className
}: {
  eyebrow?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="space-y-2">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        {title ? <h2 className="section-title">{title}</h2> : null}
        {description ? (
          <p className="max-w-prose text-sm leading-6 text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
