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

// Business-scoped models that must always be queried inside withBusinessScope.
// This list mirrors the tables covered by migration 0040_enable_business_rls.
const BUSINESS_SCOPED_MODELS = new Set([
  "featureFlagOverride",
  "businessInboundAddress",
  "qrCode",
  "joinLink",
  "membership",
  "staffMember",
  "staffInvite",
  "aiWorkspace",
  "aiProviderConnection",
  "businessDocument",
  "webSource",
  "documentChunk",
  "aiChatSession",
  "loyaltyTier",
  "reward",
  "promotion",
  "promotionRedemption",
  "event",
  "message",
  "loyaltyTransaction",
  "pipelineStage",
  "salesThread",
  "outboundDocument",
  "followUpTask",
  "referralCode",
  "customerImportRun",
  "aiTokenUsage",
  "staffAuditLog",
  "customerSegment",
  "ocrReceipt",
  "businessSubscription",
  "businessInvoice",
  "conversation",
  "conversationParticipant",
  "merchantCreditLedger",
]);

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

const BUSINESS_SCOPE_TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 };

function assertBusinessScopeId(businessId: string) {
  if (!businessId.trim()) {
    throw new Error("businessId is required for a scoped Prisma transaction.");
  }
}

function assertUserScopeId(userId: string) {
  if (!userId.trim()) {
    throw new Error("userId is required for a scoped Prisma transaction.");
  }
}

const globalForPrisma = globalThis as {
  prisma?: ExtendedPrismaClient;
  _rlsScopeDepth?: number;
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

export async function withBusinessScope<T>(
  businessId: string,
  fn: (tx: PrismaTransactionClient) => Promise<T>
): Promise<T> {
  assertBusinessScopeId(businessId);

  return prisma.$transaction(async (tx) => {
    // Track nesting depth so the dev guard does not fire for inner calls.
    const g = globalThis as { _rlsScopeDepth?: number };
    g._rlsScopeDepth = (g._rlsScopeDepth ?? 0) + 1;
    try {
      await tx.$executeRaw`SELECT set_config('app.current_business_id', ${businessId}, true)`;
      return await fn(tx);
    } finally {
      g._rlsScopeDepth = (g._rlsScopeDepth ?? 1) - 1;
    }
  }, BUSINESS_SCOPE_TX_OPTIONS);
}

export async function withUserScope<T>(
  userId: string,
  fn: (tx: PrismaTransactionClient) => Promise<T>
): Promise<T> {
  assertUserScopeId(userId);

  return prisma.$transaction(async (tx) => {
    const g = globalThis as { _rlsScopeDepth?: number };
    g._rlsScopeDepth = (g._rlsScopeDepth ?? 0) + 1;
    try {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
      return await fn(tx);
    } finally {
      g._rlsScopeDepth = (g._rlsScopeDepth ?? 1) - 1;
    }
  }, BUSINESS_SCOPE_TX_OPTIONS);
}

export async function withSystemScope<T>(
  fn: (tx: PrismaTransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const g = globalThis as { _rlsScopeDepth?: number };
    g._rlsScopeDepth = (g._rlsScopeDepth ?? 0) + 1;
    try {
      await tx.$executeRaw`SELECT set_config('app.system_scope', 'on', true)`;
      return await fn(tx);
    } finally {
      g._rlsScopeDepth = (g._rlsScopeDepth ?? 1) - 1;
    }
  }, BUSINESS_SCOPE_TX_OPTIONS);
}

// Dev-only guard: log a [RLS-WARN] when a query targets a business-scoped
// model but runs outside a scope transaction. This never throws and has zero
// effect in production.
if (env.NODE_ENV !== "production") {
  try {
    (prisma as unknown as { $on: (event: string, cb: (e: { model?: string }) => void) => void }).$on(
      "query",
      (event: { model?: string }) => {
        const model = event.model?.toLowerCase();
        const g = globalThis as { _rlsScopeDepth?: number };
        if (
          model &&
          BUSINESS_SCOPED_MODELS.has(model) &&
          !(g._rlsScopeDepth && g._rlsScopeDepth > 0)
        ) {
          console.warn(
            `[RLS-WARN] Query on business-scoped model "${event.model}" ran outside ` +
            `withBusinessScope/withSystemScope/withUserScope. With FORCE RLS active this ` +
            `will return 0 rows or error in production.`
          );
        }
      }
    );
  } catch {
    // $on is not available on the extended client in all Prisma versions — silently skip.
  }
}
