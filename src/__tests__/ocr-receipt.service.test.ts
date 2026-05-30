import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTx = {
  ocrReceipt: {
    findUnique: vi.fn(),
    update: vi.fn()
  },
  loyaltyTransaction: {
    findFirst: vi.fn(),
    create: vi.fn()
  },
  membership: {
    findFirst: vi.fn(),
    update: vi.fn()
  }
};

const prisma = {
  $transaction: vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>, _opts?: unknown) =>
    fn(mockTx)
  ),
  ocrReceipt: {
    findUnique: vi.fn(),
    update: vi.fn()
  }
};

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/server/services/loyalty.service", () => ({
  recalculateTier: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/server/services/staff-audit.service", () => ({
  recordStaffAuditLog: vi.fn().mockResolvedValue(undefined)
}));

const { approveOcrReceipt, rejectOcrReceipt } = await import(
  "@/server/services/ocr-receipt.service"
);

const { recalculateTier } = await import("@/server/services/loyalty.service");
const { recordStaffAuditLog } = await import("@/server/services/staff-audit.service");

beforeEach(() => vi.clearAllMocks());

function mockPendingReceipt() {
  const receipt = {
    id: "rcpt1",
    businessId: "biz1",
    userId: "usr1",
    pointsToAward: 100,
    status: "PENDING_REVIEW"
  };
  prisma.ocrReceipt.findUnique.mockResolvedValue(receipt);
  mockTx.ocrReceipt.findUnique.mockResolvedValue(receipt);
  mockTx.loyaltyTransaction.findFirst.mockResolvedValue(null);
  mockTx.loyaltyTransaction.create.mockResolvedValue({ id: "txn1" });
  mockTx.membership.findFirst.mockResolvedValue({ id: "mem1" });
  mockTx.membership.update.mockResolvedValue({});
  mockTx.ocrReceipt.update.mockResolvedValue({});
  prisma.ocrReceipt.update.mockResolvedValue({ businessId: "biz1" });
}

describe("approveOcrReceipt", () => {
  it("awards points and recalculates tier on approval", async () => {
    mockPendingReceipt();
    await approveOcrReceipt("rcpt1", "staff1", "biz1");
    expect(mockTx.loyaltyTransaction.create).toHaveBeenCalledOnce();
    expect(recalculateTier).toHaveBeenCalledWith(mockTx, {
      membershipId: "mem1",
      actorUserId: "staff1"
    });
  });

  it("writes an audit log after approval", async () => {
    mockPendingReceipt();
    await approveOcrReceipt("rcpt1", "staff1", "biz1");
    expect(recordStaffAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "OCR_RECEIPT_APPROVED", targetId: "rcpt1" })
    );
  });

  it("skips creating a duplicate loyalty transaction when one already exists", async () => {
    mockPendingReceipt();
    mockTx.loyaltyTransaction.findFirst.mockResolvedValue({ id: "txn_existing" });
    await approveOcrReceipt("rcpt1", "staff1", "biz1");
    expect(mockTx.loyaltyTransaction.create).not.toHaveBeenCalled();
    expect(mockTx.ocrReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED" }) })
    );
  });

  it("throws when receipt is not found", async () => {
    prisma.ocrReceipt.findUnique.mockResolvedValue(null);
    await expect(approveOcrReceipt("missing", "staff1", "biz1")).rejects.toThrow("not found");
  });

  it("throws when receipt is already approved", async () => {
    prisma.ocrReceipt.findUnique.mockResolvedValue({ id: "rcpt1", businessId: "biz1", status: "APPROVED" });
    await expect(approveOcrReceipt("rcpt1", "staff1", "biz1")).rejects.toThrow("APPROVED");
  });
});

describe("rejectOcrReceipt", () => {
  it("updates status to REJECTED and writes audit log", async () => {
    prisma.ocrReceipt.update.mockResolvedValue({});
    prisma.ocrReceipt.findUnique.mockResolvedValue({ id: "rcpt1", businessId: "biz1", status: "PENDING_REVIEW" });
    await rejectOcrReceipt("rcpt1", "staff1", "biz1");
    expect(prisma.ocrReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED" }) })
    );
    expect(recordStaffAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "OCR_RECEIPT_REJECTED", targetId: "rcpt1" })
    );
  });

  it("throws when receipt belongs to a different business", async () => {
    prisma.ocrReceipt.findUnique.mockResolvedValue({ id: "rcpt1", businessId: "biz_other", status: "PENDING_REVIEW" });
    await expect(rejectOcrReceipt("rcpt1", "staff1", "biz1")).rejects.toThrow("not found");
  });
});
