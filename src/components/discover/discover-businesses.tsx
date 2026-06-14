"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";

import { BusinessCard } from "@/components/business/business-card";
import { GeoDiscoveryButton } from "@/components/discover/geo-discovery-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";

type Option = { value: string; label: string };
type BusinessResult = {
  id: string;
  name: string;
  slug: string;
  category: string;
  logoUrl: string | null;
};

type DiscoverBusinessesProps = {
  categories: Option[];
  provinces: Option[];
};

export function DiscoverBusinesses({ categories, provinces }: DiscoverBusinessesProps) {
  const router = useRouter();
  const rawSearchParams = useSearchParams();
  const searchParams = useMemo(() => rawSearchParams ?? new URLSearchParams(), [rawSearchParams]);
  const [businesses, setBusinesses] = useState<BusinessResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => searchParams.toString(), [searchParams]);
  const current = useMemo(() => ({
    q: searchParams.get("q") ?? "",
    category: searchParams.get("category") ?? "",
    province: searchParams.get("province") ?? "",
    city: searchParams.get("city") ?? ""
  }), [searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetch("/api/discover/businesses" + (queryString ? "?" + queryString : ""), {
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load businesses.");
        return response.json() as Promise<{ businesses: BusinessResult[] }>;
      })
      .then((payload) => setBusinesses(payload.businesses))
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError("Could not load businesses. Try again in a moment.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [queryString]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const next = new URLSearchParams();

    for (const key of ["q", "category", "province", "city"]) {
      const value = String(formData.get(key) ?? "").trim();
      if (value) next.set(key, value);
    }

    router.push((next.size ? "/discover?" + next.toString() : "/discover") as Route);
  }

  return (
    <>
      <Card variant="surface" className="mt-6">
        <form className="grid gap-3 md:grid-cols-4" onSubmit={onSubmit}>
          <Input name="q" label="Search" defaultValue={current.q} placeholder="Name or suburb" />
          <Select name="category" label="Category" defaultValue={current.category}>
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
          <Select name="province" label="Province" defaultValue={current.province}>
            <option value="">All provinces</option>
            {provinces.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
          <div className="grid gap-3">
            <Input name="city" label="City or suburb" defaultValue={current.city} placeholder="Sandton" />
            <Button type="submit" variant="primary">
              Search
            </Button>
          </div>
        </form>
        <div className="mt-3 border-t border-line pt-3">
          <GeoDiscoveryButton currentPath="/discover" />
        </div>
      </Card>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy={isLoading}>
        {isLoading ? (
          <Card variant="outline" className="md:col-span-2 xl:col-span-3">
            <p className="text-sm text-ink-muted">Loading businesses...</p>
          </Card>
        ) : error ? (
          <Card variant="outline" className="md:col-span-2 xl:col-span-3">
            <p className="text-sm text-danger">{error}</p>
          </Card>
        ) : businesses.length ? (
          businesses.map((business) => (
            <BusinessCard
              key={business.id}
              business={{
                name: business.name,
                slug: business.slug,
                category: business.category,
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
    </>
  );
}
