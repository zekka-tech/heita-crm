import { BusinessCategory, Province } from "@prisma/client";
import { NextResponse } from "next/server";

import { formatEnumLabel } from "@/lib/business";
import { discoverBusinesses } from "@/server/services/discovery.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const categoryParam = url.searchParams.get("category");
  const provinceParam = url.searchParams.get("province");
  const category = Object.values(BusinessCategory).includes(categoryParam as BusinessCategory)
    ? (categoryParam as BusinessCategory)
    : null;
  const province = Object.values(Province).includes(provinceParam as Province)
    ? (provinceParam as Province)
    : null;

  const businesses = await discoverBusinesses({
    query: url.searchParams.get("q"),
    category,
    province,
    city: url.searchParams.get("city")
  }).catch(() => []);

  const hasFilter = Boolean(
    url.searchParams.get("q") || category || province || url.searchParams.get("city")
  );

  return NextResponse.json(
    {
      businesses: businesses.map((business) => ({
        id: business.id,
        name: business.name,
        slug: business.slug,
        category: formatEnumLabel(business.category),
        logoUrl: business.logoUrl
      }))
    },
    {
      headers: {
        "Cache-Control": hasFilter
          ? "private, no-store"
          : "public, s-maxage=300, stale-while-revalidate=600"
      }
    }
  );
}
