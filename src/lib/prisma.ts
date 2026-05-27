import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { env, withDatabaseConnectionLimit } from "@/lib/env";

const adapter = new PrismaPg({
  connectionString: withDatabaseConnectionLimit(env.DATABASE_URL)
});

const basePrisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
});

// Soft-delete middleware: automatically filter out soft-deleted rows for
// User and Business models. findUnique/findUniqueOrThrow are rewritten to
// findFirst/findFirstOrThrow so the deletedAt filter can be applied.
const extendedPrisma = basePrisma.$extends({
  query: {
    user: {
      async findFirst({ args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
      async findMany({ args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
      async findUnique({ args, query: _query }) {
        return basePrisma.user.findFirst({
          ...args,
          where: { ...args.where, deletedAt: null }
        } as Parameters<typeof basePrisma.user.findFirst>[0]);
      },
      async findUniqueOrThrow({ args, query: _query }) {
        return basePrisma.user.findFirstOrThrow({
          ...args,
          where: { ...args.where, deletedAt: null }
        } as Parameters<typeof basePrisma.user.findFirstOrThrow>[0]);
      },
    },
    business: {
      async findFirst({ args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
      async findMany({ args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
      async findUnique({ args, query: _query }) {
        return basePrisma.business.findFirst({
          ...args,
          where: { ...args.where, deletedAt: null }
        } as Parameters<typeof basePrisma.business.findFirst>[0]);
      },
      async findUniqueOrThrow({ args, query: _query }) {
        return basePrisma.business.findFirstOrThrow({
          ...args,
          where: { ...args.where, deletedAt: null }
        } as Parameters<typeof basePrisma.business.findFirstOrThrow>[0]);
      },
    },
  },
});

type ExtendedPrismaClient = typeof extendedPrisma;

const globalForPrisma = globalThis as {
  prisma?: ExtendedPrismaClient;
};

export const prisma = globalForPrisma.prisma ?? extendedPrisma;

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// When prisma.$extends() is used, the callback tx inside $transaction is typed
// as the extended client's transaction type, not Prisma.TransactionClient.
// Export this type so services can annotate their tx parameters correctly.
export type PrismaTransactionClient = Parameters<
  Parameters<(typeof prisma)["$transaction"]>[0]
>[0];
