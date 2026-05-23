import { BusinessCategory, Province, StaffRole } from "@prisma/client";

import { createJoinToken, createUniqueBusinessSlug } from "@/lib/business";
import { prisma } from "@/lib/prisma";

type CreateBusinessInput = {
  userId: string;
  name: string;
  description?: string | null;
  category: BusinessCategory;
  province: Province;
  phone?: string | null;
  email?: string | null;
  loyaltySignupBonus?: number;
};

export async function createBusinessWithDefaults(input: CreateBusinessInput) {
  const slug = await createUniqueBusinessSlug(input.name);
  const qrToken = createJoinToken("qr");
  const joinToken = createJoinToken("join");

  return prisma.business.create({
    data: {
      slug,
      name: input.name,
      description: input.description || null,
      category: input.category,
      province: input.province,
      phone: input.phone || null,
      email: input.email || null,
      loyaltySignupBonus: input.loyaltySignupBonus ?? 100,
      staffMembers: {
        create: {
          userId: input.userId,
          role: StaffRole.OWNER
        }
      },
      aiWorkspace: {
        create: {}
      },
      loyaltyTiers: {
        create: [
          { name: "Bronze", minPoints: 0, rank: 1, colorHex: "#B76E3B" },
          { name: "Silver", minPoints: 500, rank: 2, colorHex: "#7C8A97" },
          { name: "Gold", minPoints: 1500, rank: 3, colorHex: "#D99825" }
        ]
      },
      qrCodes: {
        create: {
          name: "Primary join QR",
          token: qrToken,
          isPrimary: true
        }
      },
      joinLinks: {
        create: {
          name: "Primary join link",
          token: joinToken,
          channel: "DIRECT_LINK"
        }
      }
    },
    include: {
      qrCodes: true,
      joinLinks: true,
      loyaltyTiers: true
    }
  });
}
