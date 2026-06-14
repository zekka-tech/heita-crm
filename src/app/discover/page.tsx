import type { Metadata } from "next";
import Link from "next/link";

import { DiscoverBusinesses } from "@/components/discover/discover-businesses";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { businessCategories, formatEnumLabel, provinces } from "@/lib/business";

export const metadata: Metadata = {
  title: "Discover businesses",
  description: "Find South African retailers and small businesses near you offering loyalty rewards on Heita."
};

export const dynamic = "force-static";
export const revalidate = 300;

export default function DiscoverPage() {
  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <Card variant="hero" className="px-6 py-8 sm:px-10">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          Discover businesses near you
        </h1>
        <p className="mt-3 max-w-2xl text-white/85">
          Find retailers, restaurants, and service businesses on Heita by name,
          category, province, or suburb.
        </p>
      </Card>

      <DiscoverBusinesses
        categories={businessCategories.map((value) => ({ value, label: formatEnumLabel(value) }))}
        provinces={provinces.map((value) => ({ value, label: formatEnumLabel(value) }))}
      />

      <div className="mt-6">
        <Button asChild variant="secondary">
          <Link href="/">Back to Heita</Link>
        </Button>
      </div>
    </main>
  );
}
