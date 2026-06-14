import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTx = {
  ocrReceipt: {
    create: vi.fn(),
    findMany: vi.fn(),
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

const withBusinessScope = vi.fn((_businessId: string, fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));

const prisma = mockTx;

vi.mock("@/lib/prisma", () => ({ prisma, withBusinessScope }));
vi.mock("@/server/services/loyalty.service", () => ({
  recalculateTier: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/server/services/staff-audit.service", () => ({
  recordStaffAuditLog: vi.fn().mockResolvedValue(undefined)
}));

const { approveOcrReceipt, rejectOcrReceipt, listPendingOcrReceipts, parseReceiptText, extractReceiptData, submitOcrReceipt } = await import(
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
  mockTx.ocrReceipt.findUnique.mockResolvedValue(receipt);
  mockTx.ocrReceipt.findUnique.mockResolvedValue(receipt);
  mockTx.loyaltyTransaction.findFirst.mockResolvedValue(null);
  mockTx.loyaltyTransaction.create.mockResolvedValue({ id: "txn1" });
  mockTx.membership.findFirst.mockResolvedValue({ id: "mem1" });
  mockTx.membership.update.mockResolvedValue({});
  mockTx.ocrReceipt.update.mockResolvedValue({});
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
      expect.objectContaining({ action: "OCR_RECEIPT_APPROVED", targetId: "rcpt1" }),
      mockTx
    );
  });

  it("skips creating a duplicate loyalty transaction when one already exists", async () => {
    mockPendingReceipt();
    mockTx.loyaltyTransaction.findFirst.mockResolvedValue({ id: "txn_existing" });
    await approveOcrReceipt("rcpt1", "staff1", "biz1");
    expect(mockTx.loyaltyTransaction.create).not.toHaveBeenCalled();
    expect(mockTx.ocrReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rcpt1", businessId: "biz1" },
        data: expect.objectContaining({ status: "APPROVED" })
      })
    );
  });

  it("throws when receipt is not found", async () => {
    mockTx.ocrReceipt.findUnique.mockResolvedValue(null);
    await expect(approveOcrReceipt("missing", "staff1", "biz1")).rejects.toThrow("not found");
  });

  it("throws when receipt is already approved", async () => {
    mockTx.ocrReceipt.findUnique.mockResolvedValue({ id: "rcpt1", businessId: "biz1", status: "APPROVED" });
    await expect(approveOcrReceipt("rcpt1", "staff1", "biz1")).rejects.toThrow("APPROVED");
  });
});

describe("rejectOcrReceipt", () => {
  it("updates status to REJECTED and writes audit log", async () => {
    mockTx.ocrReceipt.update.mockResolvedValue({});
    mockTx.ocrReceipt.findUnique.mockResolvedValue({ id: "rcpt1", businessId: "biz1", status: "PENDING_REVIEW" });
    await rejectOcrReceipt("rcpt1", "staff1", "biz1");
    expect(mockTx.ocrReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rcpt1", businessId: "biz1" },
        data: expect.objectContaining({ status: "REJECTED" })
      })
    );
    expect(recordStaffAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "OCR_RECEIPT_REJECTED", targetId: "rcpt1" }),
      mockTx
    );
  });

  it("throws when receipt belongs to a different business", async () => {
    mockTx.ocrReceipt.findUnique.mockResolvedValue({ id: "rcpt1", businessId: "biz_other", status: "PENDING_REVIEW" });
    await expect(rejectOcrReceipt("rcpt1", "staff1", "biz1")).rejects.toThrow("not found");
  });
});



describe("submitOcrReceipt", () => {
  it("creates a pending receipt inside the business scope", async () => {
    mockTx.ocrReceipt.create.mockResolvedValue({ id: "rcpt_submit" });

    await expect(
      submitOcrReceipt({
        businessId: "biz1",
        userId: "usr1",
        imageUrl: "https://store.example/r.jpg",
        clientRawText: "KFC\nTOTAL R 89.90"
      })
    ).resolves.toEqual(
      expect.objectContaining({ receiptId: "rcpt_submit", pointsToAward: 90 })
    );

    expect(withBusinessScope).toHaveBeenCalledWith("biz1", expect.any(Function));
    expect(mockTx.ocrReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "biz1",
        userId: "usr1",
        imageUrl: "https://store.example/r.jpg",
        pointsToAward: 90,
        status: "PENDING_REVIEW"
      })
    });
  });
});

describe("listPendingOcrReceipts", () => {
  it("lists pending receipts inside the business scope", async () => {
    mockTx.ocrReceipt.findMany.mockResolvedValue([{ id: "rcpt1" }]);

    await expect(listPendingOcrReceipts("biz1")).resolves.toEqual([{ id: "rcpt1" }]);

    expect(withBusinessScope).toHaveBeenCalledWith("biz1", expect.any(Function));
    expect(mockTx.ocrReceipt.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz1", status: "PENDING_REVIEW" },
      orderBy: { createdAt: "asc" },
      take: 50
    });
  });
});

describe("parseReceiptText", () => {
  it("extracts total and business name with high confidence", () => {
    const text = [
      "PICK N PAY",
      "123 Long Street, Cape Town",
      "Milk            R 24.99",
      "Bread           R 18.50",
      "SUBTOTAL        R 43.49",
      "TOTAL           R 43.49"
    ].join("\n");
    const r = parseReceiptText(text);
    expect(r.total).toBe(43.49);
    expect(r.businessName).toBe("PICK N PAY");
    expect(r.confidence).toBe("high");
  });

  it("picks the largest plausible total across keyword lines", () => {
    const text = [
      "Woolworths",
      "SUBTOTAL  R100.00",
      "VAT       R 15.00",
      "TOTAL     R115.00"
    ].join("\n");
    const r = parseReceiptText(text);
    expect(r.total).toBe(115);
  });

  it("handles 'AMOUNT DUE' and European decimal comma", () => {
    const text = ["Shoprite", "AMOUNT DUE  R1 234,56"].join("\n");
    const r = parseReceiptText(text);
    expect(r.total).toBe(1234.56);
    expect(r.businessName).toBe("Shoprite");
    expect(r.confidence).toBe("high");
  });

  it("handles US-style thousands separators", () => {
    const text = ["Checkers", "Balance Due  R1,234.56"].join("\n");
    const r = parseReceiptText(text);
    expect(r.total).toBe(1234.56);
  });

  it("returns medium confidence when total found but no business name", () => {
    const text = ["TAX INVOICE", "VAT No 123456", "TOTAL R 50.00"].join("\n");
    const r = parseReceiptText(text);
    expect(r.total).toBe(50);
    expect(r.businessName).toBeNull();
    expect(r.confidence).toBe("medium");
  });

  it("returns low confidence when nothing parseable", () => {
    const r = parseReceiptText("blurry\n#### ???\n12-04-2026");
    expect(r.total).toBeNull();
    expect(r.confidence).toBe("low");
  });

  it("ignores blocklisted header lines for business name", () => {
    const text = ["TAX INVOICE", "Spar Express", "TOTAL R 12.00"].join("\n");
    const r = parseReceiptText(text);
    expect(r.businessName).toBe("Spar Express");
  });
});

describe("extractReceiptData fallback logic", () => {
  const fetchSpy = vi.spyOn(global, "fetch");

  beforeEach(() => {
    fetchSpy.mockReset();
    process.env.DEEPSEEK_API_KEY = "test-key";
  });

  function mockDeepSeekResponse(body: unknown) {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(body) } }]
      })
    } as Response);
  }

  it("uses parsed client text and does NOT call DeepSeek when confident", async () => {
    const result = await extractReceiptData({
      imageUrl: "https://store.example/r.jpg",
      clientRawText: "KFC\nTOTAL R 89.90"
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.total).toBe(89.9);
    expect(result.businessName).toBe("KFC");
    expect(result.confidence).toBe("high");
    expect(result.rawText).toContain("KFC");
  });

  it("falls back to DeepSeek when client parse confidence is low", async () => {
    mockDeepSeekResponse({
      total: 42,
      businessName: "Remote Store",
      rawText: "Remote Store\nTOTAL R42",
      confidence: "high"
    });
    const result = await extractReceiptData({
      imageUrl: "https://store.example/r.jpg",
      clientRawText: "garbled ?????"
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.total).toBe(42);
    expect(result.businessName).toBe("Remote Store");
  });

  it("falls back to DeepSeek when client text has no total", async () => {
    mockDeepSeekResponse({
      total: 10,
      businessName: "Vision Store",
      rawText: "x",
      confidence: "high"
    });
    const result = await extractReceiptData({
      imageUrl: "https://store.example/r.jpg",
      clientRawText: "Some Shop\nno amounts here"
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.total).toBe(10);
  });

  it("goes straight to DeepSeek when client text is empty", async () => {
    mockDeepSeekResponse({
      total: 7,
      businessName: "Empty Fallback",
      rawText: "x",
      confidence: "medium"
    });
    const result = await extractReceiptData({
      imageUrl: "https://store.example/r.jpg",
      clientRawText: ""
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.total).toBe(7);
  });

  it("returns low-confidence empty result when DeepSeek is unconfigured", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const result = await extractReceiptData({
      imageUrl: "https://store.example/r.jpg",
      clientRawText: ""
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      total: null,
      businessName: null,
      rawText: "",
      confidence: "low"
    });
  });

  it("never throws and returns low result when DeepSeek fetch fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));
    const result = await extractReceiptData({
      imageUrl: "https://store.example/r.jpg",
      clientRawText: ""
    });
    expect(result.confidence).toBe("low");
    expect(result.total).toBeNull();
  });
});
