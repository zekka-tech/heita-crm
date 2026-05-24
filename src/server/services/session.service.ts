import { prisma } from "@/lib/prisma";

/**
 * Bump the user's `sessionVersion`. Existing JWT-backed sessions encode the
 * version at the time they were issued; the auth callback compares them so
 * older sessions are rejected after a bump.
 */
export async function revokeAllSessions(userId: string): Promise<number> {
  const result = await prisma.user.update({
    where: { id: userId },
    data: {
      sessionVersion: {
        increment: 1
      }
    },
    select: { sessionVersion: true }
  });

  return result.sessionVersion;
}

export async function getCurrentSessionVersion(userId: string): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true, deletedAt: true }
  });

  if (!user || user.deletedAt) return null;
  return user.sessionVersion;
}
