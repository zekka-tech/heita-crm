import { prisma } from "@/lib/prisma";

export type PublicBusinessIdentity = { id: string; name: string };

export async function findPublicBusinessIdentityBySlug(
  slug: string
): Promise<PublicBusinessIdentity | null> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;

  return prisma.business.findFirst({
    where: {
      slug: normalizedSlug,
      deletedAt: null,
      isActive: true
    },
    select: { id: true, name: true }
  });
}
