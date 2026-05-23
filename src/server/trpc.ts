import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function createTRPCContext() {
  const session = await auth();

  return {
    prisma,
    session
  };
}

export function router<T extends Record<string, unknown>>(definition: T) {
  return definition;
}

export const publicProcedure = {
  query<T>(resolver: T) {
    return resolver;
  }
};

export const protectedProcedure = publicProcedure;
