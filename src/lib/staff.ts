import { StaffRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const ROLE_LEVEL: Record<Exclude<StaffRole, "AI_TRAINER" | "FRANCHISE_ADMIN">, number> = {
  STAFF: 1,
  MANAGER: 2,
  OWNER: 3
};

const FRANCHISE_ADMIN_LEVEL = 4;

function getRoleLevel(role: StaffRole): number {
  if (role === "FRANCHISE_ADMIN") return FRANCHISE_ADMIN_LEVEL;
  if (role === "AI_TRAINER") return 0;
  return ROLE_LEVEL[role];
}

export function hasStaffRoleAccess(
  role: StaffRole,
  allowedRoles: readonly StaffRole[]
): boolean {
  if (allowedRoles.includes(role)) {
    return true;
  }

  if (role === StaffRole.OWNER) {
    return true;
  }

  if (role === StaffRole.AI_TRAINER) {
    return false;
  }

  const requiredLevel = allowedRoles.reduce<number | null>((highest, allowedRole) => {
    if (allowedRole === StaffRole.AI_TRAINER) {
      return highest;
    }

    const level = getRoleLevel(allowedRole);
    if (highest === null || level > highest) {
      return level;
    }

    return highest;
  }, null);

  if (requiredLevel === null) {
    return false;
  }

  return getRoleLevel(role) >= requiredLevel;
}

export async function requireRole(input: {
  businessId: string;
  userId: string;
  allowedRoles: readonly StaffRole[];
}) {
  const staffMembership = await prisma.staffMember.findUnique({
    where: {
      businessId_userId: {
        businessId: input.businessId,
        userId: input.userId
      }
    },
    select: {
      role: true
    }
  });

  if (!staffMembership) {
    throw new Error("You do not have access to manage this business.");
  }

  if (!hasStaffRoleAccess(staffMembership.role, input.allowedRoles)) {
    throw new Error("You do not have the required role for this action.");
  }

  return staffMembership;
}
