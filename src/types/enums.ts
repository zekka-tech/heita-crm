// Lightweight re-exports of Prisma enums safe to import in "use client" files.
// Do NOT import @prisma/client here — that pulls the full Prisma bundle into
// the browser build. Keep these in sync with prisma/schema.prisma manually.

export const StaffRole = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  STAFF: "STAFF",
  AI_TRAINER: "AI_TRAINER",
  FRANCHISE_ADMIN: "FRANCHISE_ADMIN",
} as const;
export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];
