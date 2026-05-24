import { BusinessCategory, Province } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type DiscoverBusinessesInput = {
  query?: string | null;
  category?: BusinessCategory | null;
  province?: Province | null;
  city?: string | null;
  limit?: number;
};

export async function discoverBusinesses(input: DiscoverBusinessesInput) {
  const query = input.query?.trim();
  const city = input.city?.trim();

  return prisma.business.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(input.category ? { category: input.category } : {}),
      ...(input.province ? { province: input.province } : {}),
      ...(city
        ? {
            OR: [
              { city: { contains: city, mode: "insensitive" } },
              { suburb: { contains: city, mode: "insensitive" } }
            ]
          }
        : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { city: { contains: query, mode: "insensitive" } },
              { suburb: { contains: query, mode: "insensitive" } }
            ]
          }
        : {})
    },
    orderBy: [{ createdAt: "desc" }],
    take: input.limit ?? 24
  });
}

export async function listFeaturedCategories() {
  const results = await prisma.business.groupBy({
    by: ["category"],
    where: {
      deletedAt: null,
      isActive: true
    },
    _count: {
      category: true
    }
  });

  return results
    .sort((left, right) => right._count.category - left._count.category)
    .slice(0, 6);
}
