import { StaffRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  $transaction: vi.fn(),
  staffMember: {
    findUnique: vi.fn()
  },
  event: {
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  staffAuditLog: {
    create: vi.fn()
  }
};

vi.mock("@/lib/prisma", () => ({
  prisma
}));

const { createEvent, deleteEvent, listEventsForStaff, updateEvent } = await import(
  "@/server/services/events.service"
);

function mockManagerRole(businessId = "biz_1") {
  prisma.staffMember.findUnique.mockResolvedValue({
    role: StaffRole.MANAGER,
    businessId,
    userId: "user_1"
  });
}

function buildTransaction() {
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
    fn(prisma)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  buildTransaction();
});

describe("createEvent", () => {
  it("rejects an end date that is not after the start date", async () => {
    mockManagerRole();

    await expect(
      createEvent({
        businessId: "biz_1",
        actorUserId: "user_1",
        title: "Launch",
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-01T10:00:00Z")
      })
    ).rejects.toThrow(/end date must be after/i);

    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it("creates the event and writes an audit log entry", async () => {
    mockManagerRole();
    prisma.event.create.mockResolvedValue({
      id: "evt_1",
      businessId: "biz_1",
      title: "Launch",
      description: null,
      startsAt: new Date("2026-06-01T10:00:00Z"),
      endsAt: new Date("2026-06-01T12:00:00Z"),
      location: null,
      isReminderOn: true
    });

    await createEvent({
      businessId: "biz_1",
      actorUserId: "user_1",
      title: "Launch",
      startsAt: new Date("2026-06-01T10:00:00Z"),
      endsAt: new Date("2026-06-01T12:00:00Z")
    });

    expect(prisma.event.create).toHaveBeenCalledOnce();
    expect(prisma.staffAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "event.create",
          targetType: "Event",
          targetId: "evt_1"
        })
      })
    );
  });
});

describe("updateEvent", () => {
  it("enforces the manager role via the business of the existing event", async () => {
    prisma.event.findUniqueOrThrow.mockResolvedValue({
      id: "evt_1",
      businessId: "biz_2",
      startsAt: new Date("2026-06-01T10:00:00Z"),
      endsAt: null
    });
    prisma.staffMember.findUnique.mockResolvedValue({
      role: StaffRole.STAFF,
      businessId: "biz_2",
      userId: "user_2"
    });

    await expect(
      updateEvent({
        eventId: "evt_1",
        actorUserId: "user_2",
        title: "New title"
      })
    ).rejects.toThrow();

    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});

describe("deleteEvent", () => {
  it("hard-deletes the event and records the audit log", async () => {
    prisma.event.findUniqueOrThrow.mockResolvedValue({
      id: "evt_9",
      businessId: "biz_1",
      title: "Old launch"
    });
    mockManagerRole();
    prisma.event.delete.mockResolvedValue({
      id: "evt_9",
      businessId: "biz_1",
      title: "Old launch"
    });

    await deleteEvent({ eventId: "evt_9", actorUserId: "user_1" });

    expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: "evt_9" } });
    expect(prisma.staffAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "event.delete",
          targetId: "evt_9"
        })
      })
    );
  });
});

describe("listEventsForStaff", () => {
  it("annotates events with isPast based on endsAt or startsAt", async () => {
    mockManagerRole();
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);
    prisma.event.findMany.mockResolvedValue([
      {
        id: "evt_past",
        businessId: "biz_1",
        title: "Past",
        description: null,
        startsAt: past,
        endsAt: null,
        location: null,
        isReminderOn: true,
        createdAt: past,
        updatedAt: past
      },
      {
        id: "evt_future",
        businessId: "biz_1",
        title: "Future",
        description: null,
        startsAt: future,
        endsAt: null,
        location: null,
        isReminderOn: true,
        createdAt: past,
        updatedAt: past
      }
    ]);

    const events = await listEventsForStaff({
      businessId: "biz_1",
      userId: "user_1"
    });

    expect(events.find((event) => event.id === "evt_past")?.isPast).toBe(true);
    expect(events.find((event) => event.id === "evt_future")?.isPast).toBe(false);
  });
});
