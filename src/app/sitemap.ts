import type { MetadataRoute } from "next";

import { prisma } from "@/lib/prisma";
import { businessCategories } from "@/lib/business";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const businesses = await prisma.business.findMany({
    where: {
      deletedAt: null,
      isActive: true
    },
    select: {
      slug: true,
      updatedAt: true
    }
  });

  const staticRoutes = ["", "/discover", "/privacy", "/terms", "/cookies", "/pricing"].map(
    (path) => ({
      url: `${baseUrl}${path}`,
      lastModified: new Date()
    })
  );

  const categoryRoutes = businessCategories.map((category) => ({
    url: `${baseUrl}/categories/${category.toLowerCase().replace(/_/g, "-")}`,
    lastModified: new Date()
  }));

  const businessRoutes = businesses.flatMap((business) => [
    {
      url: `${baseUrl}/b/${business.slug}`,
      lastModified: business.updatedAt
    },
    {
      url: `${baseUrl}/b/${business.slug}/rewards`,
      lastModified: business.updatedAt
    },
    {
      url: `${baseUrl}/b/${business.slug}/chat`,
      lastModified: business.updatedAt
    }
  ]);

  return [...staticRoutes, ...categoryRoutes, ...businessRoutes];
}
