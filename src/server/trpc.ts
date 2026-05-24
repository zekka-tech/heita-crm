import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveRequestId } from "@/lib/request-context";

export async function createTRPCContext(input?: { req?: Request }) {
  const session = await auth();

  return {
    prisma,
    session,
    requestId: input?.req ? resolveRequestId(input.req.headers) : "trpc-server"
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, ctx }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        requestId: ctx?.requestId ?? null
      }
    };
  }
});

const requireAuth = t.middleware(({ ctx, next }) => {
  const userId = ctx.session?.user?.id;

  if (!userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      userId
    }
  });
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(requireAuth);
