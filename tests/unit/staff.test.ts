import { StaffRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { hasStaffRoleAccess } from "@/lib/staff";

describe("hasStaffRoleAccess", () => {
  it("allows staff-ranked operations to flow upward through manager and owner", () => {
    expect(hasStaffRoleAccess(StaffRole.STAFF, [StaffRole.STAFF])).toBe(true);
    expect(hasStaffRoleAccess(StaffRole.MANAGER, [StaffRole.STAFF])).toBe(true);
    expect(hasStaffRoleAccess(StaffRole.OWNER, [StaffRole.STAFF])).toBe(true);
  });

  it("does not let staff perform manager-only actions", () => {
    expect(hasStaffRoleAccess(StaffRole.STAFF, [StaffRole.MANAGER])).toBe(false);
  });

  it("treats AI trainer access as explicit", () => {
    expect(hasStaffRoleAccess(StaffRole.AI_TRAINER, [StaffRole.AI_TRAINER])).toBe(true);
    expect(hasStaffRoleAccess(StaffRole.AI_TRAINER, [StaffRole.MANAGER])).toBe(false);
    expect(hasStaffRoleAccess(StaffRole.OWNER, [StaffRole.AI_TRAINER])).toBe(true);
  });
});
