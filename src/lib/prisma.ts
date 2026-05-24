import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { env, withDatabaseConnectionLimit } from "@/lib/env";

const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
};

const adapter = new PrismaPg({
  connectionString: withDatabaseConnectionLimit(env.DATABASE_URL)
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
