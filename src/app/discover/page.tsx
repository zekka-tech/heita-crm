import type { Metadata } from "next";
import Link from "next/link";
import { BusinessCategory, Province } from "@prisma/client";

export const metadata: Metadata = {
  title: "Discover businesses",
  description: "Find South African retailers and small businesses near you offering loyalty rewards on Heita."
};

import { BusinessCard } from "@/components/business/business-card";
import { GeoDiscoveryButton } from "@/components/discover/geo-discovery-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { unstable_cache } from "next/cache";
import { businessCategories, formatEnumLabel, provinces } from "@/lib/business";
import { discoverBusinesses } from "@/server/services/discovery.service";
import { auth } from "@/lib/auth";

// Cache the unfiltered business list (most common landing) for 5 min.
// Filtered queries (q, category, province) bypass the cache since they're
// user-specific search results that should stay fresh.
const getCachedAllBusinesses = unstable_cache(
  () => discoverBusinesses({}).catch(() => []),
  ["discover-all"],
  { revalidate: 300, tags: ["businesses"] }
);

type DiscoverPageProps = {
  searchParams?: Promise<{
    q?: string;
    category?: string;
    province?: string;
    city?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const params = (searchParams ? await searchParams : {}) ?? {};
  const category = Object.values(BusinessCategory).includes(params.category as BusinessCategory)
    ? (params.category as BusinessCategory)
    : null;
  const province = Object.values(Province).includes(params.province as Province)
    ? (params.province as Province)
    : null;

  const hasFilter = params.q || params.category || params.province || params.city;

  const [businesses, session] = await Promise.all([
    hasFilter
      ? discoverBusinesses({ query: params.q ?? null, category, province, city: params.city ?? null }).catch(() => [])
      : getCachedAllBusinesses(),
    auth()
  ]);

  const backHref = session?.user ? "/home" : "/";

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

      <Card variant="surface" className="mt-6">
        <form className="grid gap-3 md:grid-cols-4">
          <Input name="q" label="Search" defaultValue={params.q ?? ""} placeholder="Name or suburb" />
          <Select name="category" label="Category" defaultValue={category ?? ""}>
            <option value="">All categories</option>
            {businessCategories.map((item) => (
              <option key={item} value={item}>
                {formatEnumLabel(item)}
              </option>
            ))}
          </Select>
          <Select name="province" label="Province" defaultValue={province ?? ""}>
            <option value="">All provinces</option>
            {provinces.map((item) => (
              <option key={item} value={item}>
                {formatEnumLabel(item)}
              </option>
            ))}
          </Select>
          <div className="grid gap-3">
            <Input name="city" label="City or suburb" defaultValue={params.city ?? ""} placeholder="Sandton" />
            <Button type="submit" variant="primary">
              Search
            </Button>
          </div>
        </form>
        <div className="mt-3 border-t border-line pt-3">
          <GeoDiscoveryButton currentPath="/discover" />
        </div>
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
            <p className="text-sm text-ink-muted">
              No businesses match these filters. Try a broader province or category.
            </p>
          </Card>
        )}
      </section>

      <div className="mt-6">
        <Button asChild variant="secondary">
          <Link href={backHref}>Back to Heita</Link>
        </Button>
      </div>
    </main>
  );
}
