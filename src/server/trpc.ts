import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function createTRPCContext() {
  const session = await auth();

  return {
    prisma,
    session
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
export type ProtectedTRPCContext = TRPCContext & {
  session: NonNullable<TRPCContext["session"]>;
  userId: string;
};

export function router<T extends Record<string, unknown>>(definition: T) {
  return definition;
}

export const publicProcedure = {
  query<T>(resolver: (options: { ctx: TRPCContext }) => T) {
    return resolver;
  }
};

export const protectedProcedure = {
  query<T>(resolver: (options: { ctx: ProtectedTRPCContext }) => T) {
    return resolver;
  }
};
