import { cache } from "react";

import { prisma } from "@/lib/prisma";

/**
 * Request-scoped memoisation using React.cache().
 * Each function is called at most once per React render tree per unique argument,
 * deduplying redundant DB lookups when layouts and pages share the same data.
 */

export const getBusinessById = cache(async (id: string) => {
  return prisma.business.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      logoUrl: true,
      coverImageUrl: true,
      description: true,
      phone: true,
      email: true,
      city: true,
      province: true,
      loyaltySignupBonus: true,
      whatsappPhoneNumber: true,
      isActive: true
    }
  });
});

export const getBusinessBySlug = cache(async (slug: string) => {
  return prisma.business.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      logoUrl: true,
      coverImageUrl: true,
      description: true,
      phone: true,
      email: true,
      city: true,
      province: true,
      loyaltySignupBonus: true,
      whatsappPhoneNumber: true,
      isActive: true,
      deletedAt: true
    }
  });
});

export const getStaffRole = cache(async (businessId: string, userId: string) => {
  const member = await prisma.staffMember.findUnique({
    where: { businessId_userId: { businessId, userId } },
    select: { role: true }
  });
  return member?.role ?? null;
});

export const getLoyaltyTiers = cache(async (businessId: string) => {
  return prisma.loyaltyTier.findMany({
    where: { businessId },
    select: { id: true, name: true, minPoints: true, rank: true, colorHex: true, perks: true },
    orderBy: { rank: "asc" }
  });
});

export const getUserMemberships = cache(async (userId: string) => {
  return prisma.membership.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      pointsBalance: true,
      businessId: true,
      business: {
        select: { name: true, slug: true, category: true, logoUrl: true }
      },
      tier: { select: { name: true } }
    },
    orderBy: { joinedAt: "desc" }
  });
});
