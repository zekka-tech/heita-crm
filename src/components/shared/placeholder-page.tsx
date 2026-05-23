import type { Route } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";

type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryHref?: Route;
  primaryLabel?: string;
};

export function PlaceholderPage({
  eyebrow,
  title,
  description,
  primaryHref,
  primaryLabel
}: PlaceholderPageProps) {
  return (
    <Card variant="surface" className="space-y-4">
      <Chip variant="primary" size="sm">
        <Sparkles className="h-3 w-3" />
        {eyebrow}
      </Chip>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
        {title}
      </h1>
      <p className="max-w-2xl text-sm leading-6 text-ink-muted">{description}</p>
      {primaryHref && primaryLabel ? (
        <Button asChild>
          <Link href={primaryHref}>{primaryLabel}</Link>
        </Button>
      ) : null}
    </Card>
  );
}
