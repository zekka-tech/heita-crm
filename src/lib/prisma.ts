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
// User and Business models on findFirst and findMany queries.
// findUnique is skipped because it uses a unique selector (not a where clause
// that accepts deletedAt filtering without converting to findFirst).
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
