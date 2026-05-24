import { BusinessCategory } from "@prisma/client";
import { notFound } from "next/navigation";

import { BusinessCard } from "@/components/business/business-card";
import { Card } from "@/components/ui/card";
import { formatEnumLabel } from "@/lib/business";
import { discoverBusinesses } from "@/server/services/discovery.service";

type CategoryPageProps = {
  params: Promise<{ category: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: CategoryPageProps) {
  const { category } = await params;
  const normalized = category.toUpperCase().replace(/-/g, "_");

  if (!Object.values(BusinessCategory).includes(normalized as BusinessCategory)) {
    return { title: "Category" };
  }

  return {
    title: `${formatEnumLabel(normalized)} businesses`,
    description: `Browse ${formatEnumLabel(normalized)} businesses on Heita.`
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category } = await params;
  const normalized = category.toUpperCase().replace(/-/g, "_");

  if (!Object.values(BusinessCategory).includes(normalized as BusinessCategory)) {
    notFound();
  }

  const businesses = await discoverBusinesses({
    category: normalized as BusinessCategory
  });

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <Card variant="hero" className="px-6 py-8 sm:px-10">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          {formatEnumLabel(normalized)} businesses
        </h1>
        <p className="mt-3 max-w-2xl text-white/85">
          Explore loyalty programmes, promotions, and AI-assisted support from
          businesses in this category.
        </p>
      </Card>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {businesses.length ? (
          businesses.map((business) => (
            <BusinessCard
              key={business.id}
              business={{
                name: business.name,
                slug: business.slug,
                category: formatEnumLabel(business.category),
                logoUrl: business.logoUrl
              }}
            />
          ))
        ) : (
          <Card variant="outline" className="md:col-span-2 xl:col-span-3">
            <p className="text-sm text-ink-muted">No businesses are live in this category yet.</p>
          </Card>
        )}
      </section>
    </main>
  );
}
