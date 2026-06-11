import { beforeEach, describe, expect, it, vi } from "vitest";

import { decryptSecret } from "@/lib/secret-crypto";

const { prisma, requireRole, recordStaffAuditLog, assertPublicHttpUrl, probeByokConnection } =
  vi.hoisted(() => ({
    prisma: {
      aiWorkspace: { upsert: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
      aiProviderConnection: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn()
      },
      $transaction: vi.fn()
    },
    requireRole: vi.fn(),
    recordStaffAuditLog: vi.fn(),
    assertPublicHttpUrl: vi.fn(),
    probeByokConnection: vi.fn()
  }));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/staff", () => ({ requireRole }));
vi.mock("@/server/services/staff-audit.service", () => ({ recordStaffAuditLog }));
vi.mock("@/lib/security", () => ({ assertPublicHttpUrl }));
vi.mock("@/lib/ai/providers", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ai/providers")>();
  return { ...original, probeByokConnection };
});

import {
  createProviderConnection,
  deleteProviderConnection,
  resolveActiveByokRuntime,
  setActiveProviderConnection,
  validateProviderConnection
} from "@/server/services/ai-provider.service";
import { encryptSecret } from "@/lib/secret-crypto";

process.env.AI_CREDENTIALS_SECRET = "test-credentials-secret";

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ role: "OWNER" });
  assertPublicHttpUrl.mockResolvedValue(["93.184.216.34"]);
  probeByokConnection.mockResolvedValue(null);
  prisma.aiWorkspace.upsert.mockResolvedValue({ id: "ws_1", activeConnectionId: null });
  prisma.aiProviderConnection.count.mockResolvedValue(0);
  prisma.aiProviderConnection.create.mockImplementation(
    ({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: "conn_1",
        status: "UNVERIFIED",
        lastValidatedAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        label: null,
        baseUrl: null,
        ...data
      })
  );
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma)
  );
});

describe("createProviderConnection", () => {
  it("encrypts the key, keeps last4, and never exposes the plaintext", async () => {
    const view = await createProviderConnection({
      businessId: "biz_1",
      userId: "user_1",
      provider: "OPENAI",
      apiKey: "sk-plaintext-key-9876"
    });

    const stored = prisma.aiProviderConnection.create.mock.calls[0]![0].data;
    expect(stored.encryptedApiKey).not.toContain("sk-plaintext-key-9876");
    expect(decryptSecret(stored.encryptedApiKey)).toBe("sk-plaintext-key-9876");
    expect(stored.keyLast4).toBe("9876");
    expect(stored.chatModel).toBe("gpt-4o-mini"); // registry default fills in

    expect(JSON.stringify(view)).not.toContain("sk-plaintext-key-9876");
    expect(view.keyLast4).toBe("9876");
    expect(recordStaffAuditLog).toHaveBeenCalled();
  });

  it("requires a base URL for CUSTOM providers", async () => {
    await expect(
      createProviderConnection({
        businessId: "biz_1",
        userId: "user_1",
        provider: "CUSTOM",
        apiKey: "key",
        chatModel: "my-model"
      })
    ).rejects.toMatchObject({ status: 400, code: "BASE_URL_REQUIRED" });
  });

  it("rejects SSRF-flagged custom base URLs", async () => {
    assertPublicHttpUrl.mockRejectedValue(new Error("not publicly routable"));
    await expect(
      createProviderConnection({
        businessId: "biz_1",
        userId: "user_1",
        provider: "CUSTOM",
        apiKey: "key",
        chatModel: "my-model",
        baseUrl: "http://169.254.169.254/v1"
      })
    ).rejects.toMatchObject({ status: 400, code: "BASE_URL_REJECTED" });
    expect(prisma.aiProviderConnection.create).not.toHaveBeenCalled();
  });

  it("rejects custom base URLs on registry providers", async () => {
    await expect(
      createProviderConnection({
        businessId: "biz_1",
        userId: "user_1",
        provider: "OPENAI",
        apiKey: "key",
        baseUrl: "https://evil.example.com/v1"
      })
    ).rejects.toMatchObject({ status: 400, code: "BASE_URL_NOT_ALLOWED" });
  });

  it("enforces the per-business connection cap", async () => {
    prisma.aiProviderConnection.count.mockResolvedValue(10);
    await expect(
      createProviderConnection({
        businessId: "biz_1",
        userId: "user_1",
        provider: "OPENAI",
        apiKey: "key"
      })
    ).rejects.toMatchObject({ status: 400, code: "CONNECTION_LIMIT" });
  });

  it("propagates role failures before touching the database", async () => {
    requireRole.mockRejectedValue(new Error("You do not have the required role for this action."));
    await expect(
      createProviderConnection({
        businessId: "biz_1",
        userId: "user_1",
        provider: "OPENAI",
        apiKey: "key"
      })
    ).rejects.toThrow(/required role/);
    expect(prisma.aiProviderConnection.create).not.toHaveBeenCalled();
  });
});

describe("validateProviderConnection", () => {
  const storedConnection = {
    id: "conn_1",
    businessId: "biz_1",
    provider: "OPENAI",
    label: null,
    baseUrl: null,
    encryptedApiKey: encryptSecret("sk-live-key"),
    keyLast4: "-key",
    chatModel: "gpt-4o-mini",
    status: "UNVERIFIED",
    lastValidatedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("marks the connection ACTIVE when the probe succeeds", async () => {
    prisma.aiProviderConnection.findFirst.mockResolvedValue(storedConnection);
    prisma.aiProviderConnection.updateMany.mockResolvedValue({ count: 1 });

    const view = await validateProviderConnection({
      businessId: "biz_1",
      userId: "user_1",
      connectionId: "conn_1"
    });

    expect(probeByokConnection).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-live-key", model: "gpt-4o-mini" })
    );
    // Mutation is tenant-scoped, never id-only.
    expect(prisma.aiProviderConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "conn_1", businessId: "biz_1" } })
    );
    expect(view.status).toBe("ACTIVE");
    expect(view.lastError).toBeNull();
  });

  it("marks the connection INVALID and stores the error when the probe fails", async () => {
    probeByokConnection.mockResolvedValue("Provider returned 401: bad key");
    prisma.aiProviderConnection.findFirst.mockResolvedValue(storedConnection);
    prisma.aiProviderConnection.updateMany.mockResolvedValue({ count: 1 });

    const view = await validateProviderConnection({
      businessId: "biz_1",
      userId: "user_1",
      connectionId: "conn_1"
    });

    expect(view.status).toBe("INVALID");
    expect(view.lastError).toMatch(/401/);
  });

  it("404s for connections owned by another business", async () => {
    prisma.aiProviderConnection.findFirst.mockResolvedValue(null);
    await expect(
      validateProviderConnection({
        businessId: "biz_other",
        userId: "user_1",
        connectionId: "conn_1"
      })
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});

describe("setActiveProviderConnection", () => {
  it("verifies ownership before activating", async () => {
    prisma.aiProviderConnection.findFirst.mockResolvedValue(null);
    await expect(
      setActiveProviderConnection({
        businessId: "biz_1",
        userId: "user_1",
        connectionId: "conn_foreign"
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.aiWorkspace.upsert).not.toHaveBeenCalled();
  });

  it("clears the active connection when passed null", async () => {
    await setActiveProviderConnection({
      businessId: "biz_1",
      userId: "user_1",
      connectionId: null
    });
    expect(prisma.aiWorkspace.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { activeConnectionId: null } })
    );
  });
});

describe("deleteProviderConnection", () => {
  it("detaches the workspace pointer and deletes inside one transaction", async () => {
    prisma.aiProviderConnection.findFirst.mockResolvedValue({
      id: "conn_1",
      businessId: "biz_1",
      provider: "OPENAI"
    });
    await deleteProviderConnection({
      businessId: "biz_1",
      userId: "user_1",
      connectionId: "conn_1"
    });
    expect(prisma.aiWorkspace.updateMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", activeConnectionId: "conn_1" },
      data: { activeConnectionId: null }
    });
    expect(prisma.aiProviderConnection.deleteMany).toHaveBeenCalledWith({
      where: { id: "conn_1", businessId: "biz_1" }
    });
  });
});

describe("resolveActiveByokRuntime", () => {
  it("returns the decrypted runtime for the active connection", async () => {
    prisma.aiWorkspace.findUnique.mockResolvedValue({
      activeConnection: {
        id: "conn_1",
        provider: "DEEPSEEK",
        baseUrl: null,
        encryptedApiKey: encryptSecret("sk-deepseek"),
        chatModel: "deepseek-chat",
        status: "ACTIVE"
      }
    });

    const runtime = await resolveActiveByokRuntime("biz_1");
    expect(runtime).toEqual({
      connectionId: "conn_1",
      provider: "DEEPSEEK",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "sk-deepseek",
      model: "deepseek-chat"
    });
  });

  it("returns null when no connection is active", async () => {
    prisma.aiWorkspace.findUnique.mockResolvedValue({ activeConnection: null });
    await expect(resolveActiveByokRuntime("biz_1")).resolves.toBeNull();
  });

  it("returns null for DISABLED connections", async () => {
    prisma.aiWorkspace.findUnique.mockResolvedValue({
      activeConnection: {
        id: "conn_1",
        provider: "OPENAI",
        baseUrl: null,
        encryptedApiKey: encryptSecret("sk-x"),
        chatModel: "gpt-4o-mini",
        status: "DISABLED"
      }
    });
    await expect(resolveActiveByokRuntime("biz_1")).resolves.toBeNull();
  });

  it("degrades to null instead of throwing on resolver errors", async () => {
    prisma.aiWorkspace.findUnique.mockRejectedValue(new Error("db down"));
    await expect(resolveActiveByokRuntime("biz_1")).resolves.toBeNull();
  });
});
