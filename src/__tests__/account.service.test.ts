import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  user: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn()
  },
  membership: {
    updateMany: vi.fn()
  },
  userConsent: {
    updateMany: vi.fn()
  },
  $transaction: vi.fn()
};

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined)
}));

const { initiateEmailChange, confirmEmailChange, softDeleteAccount } = await import(
  "@/server/services/account.service"
);

const { sendEmail } = await import("@/lib/email");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SECRET = "test-secret-for-email-verify";
});

describe("initiateEmailChange", () => {
  it("rejects invalid email formats", async () => {
    await expect(initiateEmailChange("user_1", "not-an-email")).rejects.toThrow(/valid email/i);
  });

  it("rejects emails longer than 255 chars", async () => {
    await expect(initiateEmailChange("user_1", "a".repeat(250) + "@b.com")).rejects.toThrow(
      /valid email/i
    );
  });

  it("silently returns when email is already in use (enumeration guard)", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "other_user" });
    await expect(initiateEmailChange("user_1", "taken@example.com")).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("sets pendingEmail and sends verification link for a valid new email", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({});

    await initiateEmailChange("user_1", "new@example.com");

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user_1" },
        data: { pendingEmail: "new@example.com" }
      })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new@example.com",
        subject: expect.stringMatching(/verify/i)
      })
    );
  });
});

describe("confirmEmailChange", () => {
  it("rejects an expired link", async () => {
    const exp = Date.now() - 1000;
    await expect(confirmEmailChange("user_1", "new@example.com", exp, "any")).rejects.toThrow(
      /expired/i
    );
  });

  it("rejects a tampered token", async () => {
    const exp = Date.now() + 60_000;
    await expect(
      confirmEmailChange("user_1", "new@example.com", exp, "00".repeat(32))
    ).rejects.toThrow(/invalid.*token/i);
  });

  it("rejects when pendingEmail does not match", async () => {
    // Generate a valid token via the service
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({});
    await initiateEmailChange("user_1", "correct@example.com");
    const sendCall = vi.mocked(sendEmail).mock.calls[0]![0];
    const url = new URL((sendCall as { text: string }).text.match(/https?:\/\/\S+/)![0]);
    const token = url.searchParams.get("token")!;
    const emailParam = url.searchParams.get("email")!;
    const expParam = Number(url.searchParams.get("exp"));

    prisma.user.findUnique.mockResolvedValue({ id: "user_1", pendingEmail: "different@example.com" });

    await expect(
      confirmEmailChange("user_1", emailParam, expParam, token)
    ).rejects.toThrow(/no pending email/i);
  });

  it("persists the new email and clears pendingEmail on a valid confirmation", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({});
    await initiateEmailChange("user_1", "new@example.com");
    const sendCall = vi.mocked(sendEmail).mock.calls[0]![0];
    const url = new URL((sendCall as { text: string }).text.match(/https?:\/\/\S+/)![0]);
    const token = url.searchParams.get("token")!;
    const emailParam = url.searchParams.get("email")!;
    const expParam = Number(url.searchParams.get("exp"));

    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "user_1", pendingEmail: "new@example.com" });
    prisma.user.update.mockResolvedValue({});

    await confirmEmailChange("user_1", emailParam, expParam, token);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { email: "new@example.com", pendingEmail: null }
      })
    );
  });
});

describe("softDeleteAccount", () => {
  it("nullifies PII fields and deactivates memberships in a transaction", async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ email: "old@example.com" });
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => unknown, _opts?: unknown) => fn(prisma)
    );
    prisma.user.update.mockResolvedValue({ id: "user_1", deletedAt: new Date() });
    prisma.membership.updateMany.mockResolvedValue({ count: 2 });
    prisma.userConsent.updateMany.mockResolvedValue({ count: 1 });

    await softDeleteAccount("user_1");

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: null,
          phone: null,
          image: null
        })
      })
    );
    expect(prisma.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1", isActive: true },
        data: { isActive: false }
      })
    );
  });

  it("sends a deletion confirmation email when an email address exists", async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ email: "old@example.com" });
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => unknown, _opts?: unknown) => fn(prisma)
    );
    prisma.user.update.mockResolvedValue({ id: "user_1" });
    prisma.membership.updateMany.mockResolvedValue({ count: 0 });
    prisma.userConsent.updateMany.mockResolvedValue({ count: 0 });

    await softDeleteAccount("user_1");

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "old@example.com" })
    );
  });

  it("skips the deletion email when no email is on file", async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ email: null });
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => unknown, _opts?: unknown) => fn(prisma)
    );
    prisma.user.update.mockResolvedValue({ id: "user_1" });
    prisma.membership.updateMany.mockResolvedValue({ count: 0 });
    prisma.userConsent.updateMany.mockResolvedValue({ count: 0 });

    await softDeleteAccount("user_1");

    expect(sendEmail).not.toHaveBeenCalled();
  });
});
