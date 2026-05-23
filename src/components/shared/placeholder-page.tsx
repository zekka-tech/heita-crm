import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

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
    <section className="surface rounded-[2rem] p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#af5f33]">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#143127]">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#456356]">
        {description}
      </p>
      {primaryHref && primaryLabel ? (
        <div className="mt-6">
          <Button asChild>
            <Link href={primaryHref}>{primaryLabel}</Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}
