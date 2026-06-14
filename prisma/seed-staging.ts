/**
 * prisma/seed-staging.ts
 *
 * Production-shaped staging seed (§6.3.10).
 *
 * Creates 5 businesses across all plan tiers with realistic high-volume data:
 *   FREE    →  ~1 000 members
 *   STARTER →  ~5 000 members  (two STARTER businesses)
 *   GROWTH  →  ~20 000 members
 *   SCALE   →  ~50 000 members
 *
 * Per member: 5–20 loyalty transactions (EARN / REDEEM / EXPIRY).
 * Per business: ~500 messages (channel mix) + ~100 webhook events.
 *
 * Idempotent: skips a business if its seed slug already exists.
 * RLS-safe: all tenant-scoped writes carry an explicit businessId.
 *
 * Usage:
 *   npm run db:seed:staging
 *   # or directly:
 *   tsx prisma/seed-staging.ts
 */

import { PrismaClient } from "@prisma/client";
import type {
  BusinessCategory,
  BusinessPlanId,
  JoinChannel,
  MessageChannel,
  MessageStatus,
  Province,
  TransactionType,
} from "@prisma/client";

// ─── Deterministic pseudo-random helpers ────────────────────────────────────

/** Simple LCG seeded with a numeric value — deterministic across runs. */
function makePrng(seed: number) {
  let s = seed | 0;
  return function next(max: number): number {
    s = Math.imul(1664525, s) + 1013904223;
    // Unsigned right-shift to get a positive 32-bit integer
    return ((s >>> 0) % max);
  };
}

function pick<T>(rng: (n: number) => number, arr: readonly T[]): T {
  const index = rng(arr.length);
  const value = arr[index];
  if (value === undefined) {
    throw new Error("Cannot pick from an empty array");
  }
  return value;
}

function randInt(rng: (n: number) => number, min: number, max: number): number {
  return min + rng(max - min + 1);
}

/** Deterministic CUID-like ID: "c" + 24 lowercase hex chars from seed. */
function deterministicId(seed: string): string {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
    hash = hash >>> 0;
  }
  // Expand to 24 chars by re-hashing
  let hex = "";
  let h = hash;
  for (let i = 0; i < 6; i++) {
    h = Math.imul(1664525, h) + 1013904223;
    hex += (h >>> 0).toString(16).padStart(8, "0");
  }
  return "c" + hex.slice(0, 24);
}

// ─── Seed configuration ──────────────────────────────────────────────────────

type BusinessConfig = {
  planId: BusinessPlanId;
  slug: string;
  name: string;
  category: BusinessCategory;
  province: Province;
  memberCount: number;
};

const BUSINESSES: BusinessConfig[] = [
  {
    planId: "FREE",
    slug: "staging-free-corner-store",
    name: "Corner Store (Staging)",
    category: "GROCERY",
    province: "GAUTENG",
    memberCount: 1_000,
  },
  {
    planId: "STARTER",
    slug: "staging-starter-fashion-hub",
    name: "Fashion Hub (Staging)",
    category: "FASHION",
    province: "WESTERN_CAPE",
    memberCount: 5_000,
  },
  {
    planId: "STARTER",
    slug: "staging-starter-beauty-bar",
    name: "Beauty Bar (Staging)",
    category: "BEAUTY",
    province: "KWAZULU_NATAL",
    memberCount: 5_000,
  },
  {
    planId: "GROWTH",
    slug: "staging-growth-pharmacy-chain",
    name: "Pharmacy Chain (Staging)",
    category: "PHARMACY",
    province: "EASTERN_CAPE",
    memberCount: 20_000,
  },
  {
    planId: "SCALE",
    slug: "staging-scale-restaurant-group",
    name: "Restaurant Group (Staging)",
    category: "RESTAURANT",
    province: "GAUTENG",
    memberCount: 50_000,
  },
];

const MESSAGES_PER_BUSINESS = 500;
const EVENTS_PER_BUSINESS = 100;
const MIN_TXN_PER_MEMBER = 5;
const MAX_TXN_PER_MEMBER = 20;

const EARN_TYPES: TransactionType[] = ["EARN", "SIGNUP_BONUS"];
const REDEEM_TYPE: TransactionType = "REDEEM";
const EXPIRY_TYPE: TransactionType = "EXPIRY";

const MESSAGE_CHANNELS: MessageChannel[] = ["SMS", "WHATSAPP", "IN_APP"];
const MESSAGE_STATUSES: MessageStatus[] = ["SENT", "DELIVERED", "READ", "FAILED"];
const JOIN_CHANNELS: JoinChannel[] = [
  "QR_CODE",
  "DIRECT_LINK",
  "WHATSAPP_BOT",
  "STAFF_INVITE",
  "CSV_IMPORT",
];

// ─── Main ────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

type SeedStats = {
  members: number;
  transactions: number;
  messages: number;
  events: number;
  skipped: boolean;
};

async function main() {
  process.stdout.write("Starting staging seed…\n");

  const summary = new Map<string, SeedStats>();

  for (const biz of BUSINESSES) {
    const stats: SeedStats = { members: 0, transactions: 0, messages: 0, events: 0, skipped: false };
    summary.set(biz.slug, stats);

    // ── Idempotency check ──────────────────────────────────────────────────
    const existing = await prisma.business.findFirst({ where: { slug: biz.slug } });
    if (existing) {
      process.stdout.write(`  [skip] ${biz.slug} — already seeded (id: ${existing.id})\n`);
      stats.skipped = true;
      continue;
    }

    process.stdout.write(`  [seed] ${biz.slug} (${biz.planId}, ${biz.memberCount} members)…\n`);

    // ── Create business ────────────────────────────────────────────────────
    const businessId = deterministicId(`biz:${biz.slug}`);
    await prisma.business.create({
      data: {
        id: businessId,
        planId: biz.planId,
        slug: biz.slug,
        name: biz.name,
        category: biz.category,
        province: biz.province,
        email: `staging+${biz.slug}@heita.co.za`,
        loyaltySignupBonus: 50,
        pointsExpiryDays: 365,
        isActive: true,
      },
    });

    // ── Create members in batches ──────────────────────────────────────────
    const BATCH_SIZE = 500;
    let totalTxns = 0;
    const rng = makePrng(biz.memberCount ^ biz.slug.length);

    for (let batchStart = 0; batchStart < biz.memberCount; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, biz.memberCount);

      // Build user + membership + transaction data for this batch
      const usersData: Array<{
        id: string;
        name: string;
        phone: string;
        createdAt: Date;
        updatedAt: Date;
      }> = [];

      const membershipsData: Array<{
        id: string;
        businessId: string;
        userId: string;
        joinChannel: JoinChannel;
        pointsBalance: number;
        joinedAt: Date;
      }> = [];

      const transactionsData: Array<{
        id: string;
        businessId: string;
        membershipId: string;
        userId: string;
        type: TransactionType;
        pointsDelta: number;
        description: string;
        createdAt: Date;
        expiresAt: Date | null;
      }> = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const userId = deterministicId(`user:${biz.slug}:${i}`);
        const membershipId = deterministicId(`mbr:${biz.slug}:${i}`);
        // Phone in E.164 — synthetic numbers, globally unique per seed run.
        // Prefix each business with its index (0–4) to avoid cross-business
        // collisions. Format: +27 6{bizIdx}{7-digit-member-index}
        const bizIdx = BUSINESSES.indexOf(biz);
        const memberGlobal = bizIdx * 1_000_000 + i;
        const phone = `+276${String(memberGlobal).padStart(8, "0")}`;
        const joinedAt = new Date(Date.now() - randInt(rng, 1, 730) * 86_400_000);

        usersData.push({
          id: userId,
          name: `Staging User ${biz.slug.slice(8, 14)} ${i + 1}`,
          phone,
          createdAt: joinedAt,
          updatedAt: joinedAt,
        });

        const txnCount = randInt(rng, MIN_TXN_PER_MEMBER, MAX_TXN_PER_MEMBER);
        let balance = 0;

        for (let t = 0; t < txnCount; t++) {
          const txnId = deterministicId(`txn:${biz.slug}:${i}:${t}`);
          const typeRoll = rng(10);
          let type: TransactionType;
          let pointsDelta: number;
          let description: string;
          let expiresAt: Date | null = null;

          if (t === 0) {
            // First transaction always a signup bonus
            type = "SIGNUP_BONUS";
            pointsDelta = 50;
            description = "Welcome bonus";
          } else if (typeRoll < 6) {
            // 60% EARN
            type = pick(rng, EARN_TYPES);
            pointsDelta = randInt(rng, 5, 200);
            description = "Purchase reward";
            expiresAt = new Date(joinedAt.getTime() + 365 * 86_400_000);
          } else if (typeRoll < 8 && balance > 50) {
            // 20% REDEEM (only if they have balance)
            type = REDEEM_TYPE;
            pointsDelta = -Math.min(balance, randInt(rng, 10, 100));
            description = "Reward redemption";
          } else {
            // 20% EXPIRY
            type = EXPIRY_TYPE;
            pointsDelta = -Math.min(balance, randInt(rng, 5, 50));
            description = "Points expired";
          }

          balance = Math.max(0, balance + pointsDelta);

          const txnDate = new Date(joinedAt.getTime() + randInt(rng, 0, 700) * 86_400_000);
          transactionsData.push({
            id: txnId,
            businessId,
            membershipId,
            userId,
            type,
            pointsDelta,
            description,
            createdAt: txnDate,
            expiresAt,
          });
        }

        membershipsData.push({
          id: membershipId,
          businessId,
          userId,
          joinChannel: pick(rng, JOIN_CHANNELS),
          pointsBalance: Math.max(0, balance),
          joinedAt,
        });
      }

      // Insert users (skipDuplicates in case of re-run with partial data)
      await prisma.user.createMany({ data: usersData, skipDuplicates: true });

      // Insert memberships
      await prisma.membership.createMany({ data: membershipsData, skipDuplicates: true });

      // Insert transactions
      await prisma.loyaltyTransaction.createMany({ data: transactionsData, skipDuplicates: true });

      totalTxns += transactionsData.length;

      const pct = Math.round((batchEnd / biz.memberCount) * 100);
      process.stdout.write(`    … ${batchEnd}/${biz.memberCount} members (${pct}%)\n`);
    }

    stats.members = biz.memberCount;
    stats.transactions = totalTxns;

    // ── Messages ──────────────────────────────────────────────────────────
    process.stdout.write(`    … seeding ${MESSAGES_PER_BUSINESS} messages\n`);
    const msgRng = makePrng(biz.slug.length * 31337);
    const messagesData = [];
    for (let m = 0; m < MESSAGES_PER_BUSINESS; m++) {
      const msgId = deterministicId(`msg:${biz.slug}:${m}`);
      const channel = pick(msgRng, MESSAGE_CHANNELS);
      const status = pick(msgRng, MESSAGE_STATUSES);
      const sentAt = new Date(Date.now() - randInt(msgRng, 0, 365) * 86_400_000);
      messagesData.push({
        id: msgId,
        businessId,
        channel,
        direction: msgRng(2) === 0 ? "INBOUND" : "OUTBOUND",
        body: `Staging message ${m + 1} for ${biz.name}`,
        status,
        sentAt,
        createdAt: sentAt,
      });
    }
    await prisma.message.createMany({ data: messagesData, skipDuplicates: true });
    stats.messages = MESSAGES_PER_BUSINESS;

    // ── Webhook events — use StaffAuditLog as a proxy for event volume ────
    // (There is no generic WebhookEvent model; StaffAuditLog is the closest
    //  high-volume tenant-scoped table available in this schema.)
    process.stdout.write(`    … seeding ${EVENTS_PER_BUSINESS} audit log entries\n`);

    // We need a system actor user — use the first seeded user for this business
    const actorId = deterministicId(`user:${biz.slug}:0`);
    const auditData = [];
    const auditRng = makePrng(biz.slug.charCodeAt(0) * 7919);
    const eventTypes = [
      "member.import",
      "reward.created",
      "promotion.dispatched",
      "member.joined",
      "tier.recalculated",
      "points.awarded",
      "points.redeemed",
    ];
    for (let e = 0; e < EVENTS_PER_BUSINESS; e++) {
      const auditId = deterministicId(`audit:${biz.slug}:${e}`);
      const createdAt = new Date(Date.now() - randInt(auditRng, 0, 180) * 86_400_000);
      auditData.push({
        id: auditId,
        businessId,
        actorUserId: actorId,
        action: pick(auditRng, eventTypes),
        targetType: "staging",
        targetId: deterministicId(`target:${biz.slug}:${e}`),
        metadata: { source: "staging-seed", index: e },
        createdAt,
      });
    }
    await prisma.staffAuditLog.createMany({ data: auditData, skipDuplicates: true });
    stats.events = EVENTS_PER_BUSINESS;

    process.stdout.write(`  [done] ${biz.slug}\n`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  process.stdout.write("\n─── Staging seed summary ─────────────────────────────\n");
  let totalMembers = 0;
  let totalTxns = 0;
  let totalMessages = 0;
  let totalEvents = 0;

  for (const [slug, stats] of summary.entries()) {
    const status = stats.skipped ? "SKIPPED" : "SEEDED ";
    process.stdout.write(
      `  ${status}  ${slug.padEnd(40)}  ` +
      `members=${stats.members.toLocaleString().padStart(6)}  ` +
      `txns=${stats.transactions.toLocaleString().padStart(7)}  ` +
      `msgs=${stats.messages.toLocaleString().padStart(4)}  ` +
      `events=${stats.events}\n`
    );
    totalMembers += stats.members;
    totalTxns += stats.transactions;
    totalMessages += stats.messages;
    totalEvents += stats.events;
  }

  process.stdout.write(
    `\n  TOTAL: ${totalMembers.toLocaleString()} members, ` +
    `${totalTxns.toLocaleString()} transactions, ` +
    `${totalMessages.toLocaleString()} messages, ` +
    `${totalEvents.toLocaleString()} events\n`
  );
  process.stdout.write("─────────────────────────────────────────────────────\n");
}

main()
  .catch((error) => {
    console.error("Staging seed failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
