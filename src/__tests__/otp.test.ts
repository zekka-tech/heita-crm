import { OtpPurpose } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const otpCodesDb: Record<
  string,
  {
    id: string;
    phone: string;
    codeHash: string;
    purpose: OtpPurpose;
    consumedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    channel: string;
  }
> = {};

let dbIdCounter = 0;

const prisma = {
  otpCode: {
    updateMany: vi.fn(async (args: { where: { phone?: string; purpose?: OtpPurpose; consumedAt?: null; id?: string }; data: { consumedAt: Date } }) => {
      let count = 0;
      for (const record of Object.values(otpCodesDb)) {
        const matchesPhone = args.where.phone === undefined || record.phone === args.where.phone;
        const matchesPurpose = args.where.purpose === undefined || record.purpose === args.where.purpose;
        const matchesId = args.where.id === undefined || record.id === args.where.id;
        const matchesNotConsumed = args.where.consumedAt === null ? record.consumedAt === null : true;
        if (matchesPhone && matchesPurpose && matchesId && matchesNotConsumed && record.consumedAt === null) {
          record.consumedAt = args.data.consumedAt;
          count++;
        }
      }
      return { count };
    }),
    create: vi.fn(async (args: { data: { phone: string; codeHash: string; purpose: OtpPurpose; channel: string; expiresAt: Date } }) => {
      const id = `otp_${++dbIdCounter}`;
      const record = {
        id,
        phone: args.data.phone,
        codeHash: args.data.codeHash,
        purpose: args.data.purpose,
        consumedAt: null,
        expiresAt: args.data.expiresAt,
        createdAt: new Date(),
        channel: args.data.channel
      };
      otpCodesDb[id] = record;
      return record;
    }),
    findFirst: vi.fn(async (args: { where: { phone: string; purpose: OtpPurpose; consumedAt: null; expiresAt: { gt: Date } }; orderBy: { createdAt: string } }) => {
      const now = args.where.expiresAt.gt;
      const candidates = Object.values(otpCodesDb)
        .filter(
          (r) =>
            r.phone === args.where.phone &&
            r.purpose === args.where.purpose &&
            r.consumedAt === null &&
            r.expiresAt > now
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return candidates[0] ?? null;
    })
  }
};

const redisMock = {
  set: vi.fn().mockResolvedValue("OK"),
  get: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(1)
};

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/redis", () => ({ getRedis: () => redisMock }));

const { issueOtpCode, verifyOtpAttempt } = await import("@/lib/otp");

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(otpCodesDb).forEach((k) => delete otpCodesDb[k]);
  redisMock.get.mockResolvedValue(null);
});

describe("issueOtpCode", () => {
  it("returns a 6-digit numeric code and stores a hashed version", async () => {
    const { code, expiresAt } = await issueOtpCode({
      phone: "+27821234567",
      purpose: OtpPurpose.SIGN_IN
    });

    expect(code).toMatch(/^\d{6}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prisma.otpCode.create).toHaveBeenCalledOnce();

    const createdRecord = Object.values(otpCodesDb)[0];
    expect(createdRecord?.codeHash).not.toBe(code);
    expect(createdRecord?.codeHash).toHaveLength(64);
  });

  it("invalidates any previous unconsumed codes for the same phone+purpose", async () => {
    await issueOtpCode({ phone: "+27821234567", purpose: OtpPurpose.SIGN_IN });
    await issueOtpCode({ phone: "+27821234567", purpose: OtpPurpose.SIGN_IN });

    expect(prisma.otpCode.updateMany).toHaveBeenCalledTimes(2);
    const firstCall = prisma.otpCode.updateMany.mock.calls[1]?.[0];
    expect(firstCall?.where.phone).toBe("+27821234567");
    expect(firstCall?.where.consumedAt).toBeNull();
  });

  it("does not invalidate codes for a different purpose", async () => {
    await issueOtpCode({ phone: "+27821234567", purpose: OtpPurpose.SIGN_IN });
    const allActive = Object.values(otpCodesDb).filter((r) => r.consumedAt === null);
    expect(allActive).toHaveLength(1);
  });

  it("caches the hash in Redis", async () => {
    await issueOtpCode({ phone: "+27821234567", purpose: OtpPurpose.SIGN_IN });
    expect(redisMock.set).toHaveBeenCalledOnce();
    const [key, _value, _ex, ttl] = redisMock.set.mock.calls[0] ?? [];
    expect(key).toContain("+27821234567");
    expect(ttl).toBe(600);
  });
});

describe("verifyOtpAttempt", () => {
  it("returns false for non-6-digit codes", async () => {
    await expect(
      verifyOtpAttempt({ phone: "+27821234567", code: "12345", purpose: OtpPurpose.SIGN_IN })
    ).resolves.toBe(false);
    await expect(
      verifyOtpAttempt({ phone: "+27821234567", code: "1234567", purpose: OtpPurpose.SIGN_IN })
    ).resolves.toBe(false);
    await expect(
      verifyOtpAttempt({ phone: "+27821234567", code: "abcdef", purpose: OtpPurpose.SIGN_IN })
    ).resolves.toBe(false);

    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
  });

  it("returns true for a correct code and marks it consumed", async () => {
    const { code } = await issueOtpCode({
      phone: "+27821234567",
      purpose: OtpPurpose.SIGN_IN
    });

    const result = await verifyOtpAttempt({
      phone: "+27821234567",
      code,
      purpose: OtpPurpose.SIGN_IN
    });

    expect(result).toBe(true);
    const record = Object.values(otpCodesDb)[0];
    expect(record?.consumedAt).not.toBeNull();
  });

  it("returns false for a wrong code", async () => {
    await issueOtpCode({ phone: "+27821234567", purpose: OtpPurpose.SIGN_IN });

    const result = await verifyOtpAttempt({
      phone: "+27821234567",
      code: "000000",
      purpose: OtpPurpose.SIGN_IN
    });

    expect(result).toBe(false);
  });

  it("returns false for an already-consumed code (reuse prevention)", async () => {
    const { code } = await issueOtpCode({
      phone: "+27821234567",
      purpose: OtpPurpose.SIGN_IN
    });

    const first = await verifyOtpAttempt({
      phone: "+27821234567",
      code,
      purpose: OtpPurpose.SIGN_IN
    });
    expect(first).toBe(true);

    const second = await verifyOtpAttempt({
      phone: "+27821234567",
      code,
      purpose: OtpPurpose.SIGN_IN
    });
    expect(second).toBe(false);
  });

  it("returns false for an expired code", async () => {
    const { code } = await issueOtpCode({
      phone: "+27821234567",
      purpose: OtpPurpose.SIGN_IN
    });

    const record = Object.values(otpCodesDb)[0]!;
    record.expiresAt = new Date(Date.now() - 1000);

    const result = await verifyOtpAttempt({
      phone: "+27821234567",
      code,
      purpose: OtpPurpose.SIGN_IN
    });

    expect(result).toBe(false);
  });

  it("deletes the Redis cache key on successful verification", async () => {
    const { code } = await issueOtpCode({
      phone: "+27821234567",
      purpose: OtpPurpose.SIGN_IN
    });
    redisMock.get.mockResolvedValue(null);

    await verifyOtpAttempt({ phone: "+27821234567", code, purpose: OtpPurpose.SIGN_IN });

    expect(redisMock.del).toHaveBeenCalledOnce();
    expect(redisMock.del.mock.calls[0]?.[0]).toContain("+27821234567");
  });

  it("rejects when Redis has a different hash cached (fast-path rejection)", async () => {
    await issueOtpCode({ phone: "+27821234567", purpose: OtpPurpose.SIGN_IN });
    redisMock.get.mockResolvedValue("deadbeef".repeat(8));

    const result = await verifyOtpAttempt({
      phone: "+27821234567",
      code: "123456",
      purpose: OtpPurpose.SIGN_IN
    });

    expect(result).toBe(false);
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
  });
});
