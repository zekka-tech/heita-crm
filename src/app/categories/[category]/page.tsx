import type { Metadata } from "next";
import { BusinessCategory, Province } from "@prisma/client";
import { notFound } from "next/navigation";

import { BusinessCard } from "@/components/business/business-card";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { formatEnumLabel, provinces } from "@/lib/business";
import { serializeJsonLd } from "@/lib/json-ld";
import { discoverBusinesses } from "@/server/services/discovery.service";

type CategoryPageProps = {
  params: Promise<{ category: string }>;
  searchParams?: Promise<{ province?: string; city?: string }>;
};

// Pre-build one static page per category at deploy time so the first visitor
// gets a cached response, not a cold ISR miss.
export function generateStaticParams() {
  return Object.values(BusinessCategory).map((cat) => ({
    category: cat.toLowerCase()
  }));
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category } = await params;
  const normalized = category.toUpperCase().replace(/-/g, "_");

  if (!Object.values(BusinessCategory).includes(normalized as BusinessCategory)) {
    return { title: "Category" };
  }

  const label = formatEnumLabel(normalized);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://heita.co.za";

  return {
    title: `${label} businesses in South Africa`,
    description: `Browse ${label} businesses on Heita — earn loyalty points, redeem rewards, and chat via WhatsApp.`,
    alternates: {
      languages: {
        "en-ZA": `${appUrl}/categories/${category}`,
        zu: `${appUrl}/categories/${category}`,
        xh: `${appUrl}/categories/${category}`,
        af: `${appUrl}/categories/${category}`
      }
    },
    openGraph: {
      type: "website",
      title: `${label} businesses in South Africa`,
      description: `Browse ${label} businesses on Heita — earn loyalty points, redeem rewards, and chat via WhatsApp.`,
      siteName: "Heita",
      images: [{ url: `${appUrl}/opengraph-image` }]
    },
    twitter: {
      card: "summary_large_image",
      title: `${label} businesses in South Africa`,
      description: `Browse ${label} businesses on Heita — earn loyalty points, redeem rewards, and chat via WhatsApp.`
    }
  };
}

// Public category pages contain no user-specific content — ISR with 1h TTL.
// Individual business joins are handled by /b/[slug]/join which stays dynamic.
export const revalidate = 3600;

export default async function CategoryPage({
  params,
  searchParams
}: CategoryPageProps) {
  const { category } = await params;
  const sp = searchParams ? await searchParams : {};
  const normalized = category.toUpperCase().replace(/-/g, "_");

  if (!Object.values(BusinessCategory).includes(normalized as BusinessCategory)) {
    notFound();
  }

  const province = Object.values(Province).includes(sp.province as Province)
    ? (sp.province as Province)
    : null;

  const businesses = await discoverBusinesses({
    category: normalized as BusinessCategory,
    province,
    city: sp.city ?? null
  }).catch(() => []);

  const label = formatEnumLabel(normalized);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://heita.co.za";

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <Breadcrumb
        crumbs={[
          { label: "Categories", href: "/discover" },
          { label: label }
        ]}
        className="mb-4"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `${label} businesses on Heita`,
            description: `Browse ${label} businesses in South Africa`,
            url: `${appUrl}/categories/${category}`,
            numberOfItems: businesses.length,
            itemListElement: businesses.slice(0, 20).map((b, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: {
                "@type": "LocalBusiness",
                name: b.name,
                url: `${appUrl}/b/${b.slug}`
              }
            }))
          })
        }}
      />

      <Card variant="hero" className="px-6 py-8 sm:px-10">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          {label} businesses
        </h1>
        <p className="mt-3 max-w-2xl text-white/85">
          Explore loyalty programmes, promotions, and AI-assisted support from
          {label.toLowerCase()} businesses across South Africa.
        </p>
      </Card>

      <Card variant="surface" className="mt-6">
        <form className="grid gap-3 sm:grid-cols-3">
          <Select name="province" label="Province" defaultValue={sp.province ?? ""}>
            <option value="">All provinces</option>
            {provinces.map((p) => (
              <option key={p} value={p}>
                {formatEnumLabel(p)}
              </option>
            ))}
          </Select>
          <Input
            name="city"
            label="City or suburb"
            defaultValue={sp.city ?? ""}
            placeholder="e.g. Sandton"
          />
          <div className="flex items-end">
            <Button type="submit" variant="primary" className="w-full">
              Filter
            </Button>
          </div>
        </form>
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
              No businesses matched these filters. Try removing the province or city filter.
            </p>
          </Card>
        )}
      </section>
    </main>
  );
}
