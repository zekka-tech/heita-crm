import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  $transaction: vi.fn(),
  business: {
    update: vi.fn()
  }
};

const requireRole = vi.fn();
const recordStaffAuditLog = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma,
  withBusinessScope: async (_businessId: string, fn: (tx: typeof prisma) => unknown) => fn(prisma),
  withSystemScope: async (fn: (tx: typeof prisma) => unknown) => fn(prisma)
}));
vi.mock("@/lib/staff", () => ({ requireRole }));
vi.mock("@/server/services/staff-audit.service", () => ({ recordStaffAuditLog }));

const { updateBusinessWhatsApp } = await import(
  "@/server/services/business.service"
);

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(
    async (fn: (tx: typeof prisma) => unknown) => fn(prisma)
  );
  requireRole.mockResolvedValue(undefined);
  prisma.business.update.mockResolvedValue({
    id: "biz_1",
    wabaPhoneId: "123456789012345",
    whatsappPhoneNumber: "+27821234567"
  });
});

describe("updateBusinessWhatsApp", () => {
  it("normalizes inputs, updates the business, and writes a masked audit log", async () => {
    await updateBusinessWhatsApp({
      businessId: "biz_1",
      actorUserId: "user_1",
      wabaPhoneId: "123456789012345",
      whatsappPhoneNumber: "0821234567"
    });

    expect(requireRole).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz_1", userId: "user_1" })
    );
    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: { wabaPhoneId: "123456789012345", whatsappPhoneNumber: "+27821234567" },
      select: { id: true, wabaPhoneId: true, whatsappPhoneNumber: true }
    });
    expect(recordStaffAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "business.whatsapp.update",
        targetType: "Business",
        targetId: "biz_1",
        metadata: { wabaPhoneIdConnected: true, whatsappPhoneNumber: "+278***67" }
      }),
      prisma
    );
  });

  it("treats blank inputs as a disconnect (nulls)", async () => {
    prisma.business.update.mockResolvedValue({
      id: "biz_1",
      wabaPhoneId: null,
      whatsappPhoneNumber: null
    });

    await updateBusinessWhatsApp({
      businessId: "biz_1",
      actorUserId: "user_1",
      wabaPhoneId: "",
      whatsappPhoneNumber: ""
    });

    expect(prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { wabaPhoneId: null, whatsappPhoneNumber: null }
      })
    );
    expect(recordStaffAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { wabaPhoneIdConnected: false, whatsappPhoneNumber: null }
      }),
      prisma
    );
  });

  it("rejects a non-numeric WhatsApp phone number ID", async () => {
    await expect(
      updateBusinessWhatsApp({
        businessId: "biz_1",
        actorUserId: "user_1",
        wabaPhoneId: "not-a-number",
        whatsappPhoneNumber: "+27821234567"
      })
    ).rejects.toThrow(/numeric ID/i);
    expect(prisma.business.update).not.toHaveBeenCalled();
  });

  it("rejects a display number that is not valid E.164", async () => {
    await expect(
      updateBusinessWhatsApp({
        businessId: "biz_1",
        actorUserId: "user_1",
        wabaPhoneId: "123456789012345",
        whatsappPhoneNumber: "12"
      })
    ).rejects.toThrow(/international format/i);
    expect(prisma.business.update).not.toHaveBeenCalled();
  });

  it("surfaces a friendly error when the WhatsApp ID is taken by another business", async () => {
    prisma.business.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.0.0"
      })
    );

    await expect(
      updateBusinessWhatsApp({
        businessId: "biz_1",
        actorUserId: "user_1",
        wabaPhoneId: "123456789012345",
        whatsappPhoneNumber: "+27821234567"
      })
    ).rejects.toThrow(/already connected to another business/i);
  });
});
