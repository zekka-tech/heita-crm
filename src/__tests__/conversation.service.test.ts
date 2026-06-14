import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    conversation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    conversationParticipant: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn()
    },
    message: {
      findMany: vi.fn(),
      updateMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
  withBusinessScope: vi.fn(async (_businessId: string, fn: (tx: typeof mocks.prisma) => unknown) =>
    fn(mocks.prisma)
  )
}));

const {
  getOrCreateConversation,
  getConversationsForUser,
  getConversationMessages,
  markAsRead,
  addParticipant,
  updateConversationStatus
} = await import("@/server/services/connect/conversation.service");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("conversation.service", () => {
  describe("getOrCreateConversation", () => {
    it("returns existing conversation when found", async () => {
      const existingConv = {
        id: "conv_1",
        businessId: "biz_1",
        customerId: "user_1",
        subject: null,
        channel: "IN_APP",
        status: "ACTIVE",
        lastMessageAt: new Date(),
        createdAt: new Date(),
        participants: [
          { userId: "user_1", user: { id: "user_1", name: "Alice" }, role: "OWNER", isTyping: false, lastReadAt: null }
        ],
        messages: [
          { id: "msg_1", body: "Hello", direction: "OUTBOUND", status: "SENT", createdAt: new Date() }
        ]
      };
      mocks.prisma.conversation.findFirst.mockResolvedValue(existingConv);

      const result = await getOrCreateConversation({
        businessId: "biz_1",
        customerId: "user_1"
      });

      expect(result.id).toBe("conv_1");
      expect(result.participants[0]!.name).toBe("Alice");
      expect(mocks.prisma.conversation.create).not.toHaveBeenCalled();
    });

    it("creates a new conversation when none exists", async () => {
      mocks.prisma.conversation.findFirst.mockResolvedValue(null);
      const newConv = {
        id: "conv_2",
        businessId: "biz_1",
        customerId: "user_2",
        subject: null,
        channel: "IN_APP",
        status: "ACTIVE",
        lastMessageAt: null,
        createdAt: new Date(),
        participants: [
          { userId: "user_2", user: { id: "user_2", name: "Bob" }, role: "OWNER", isTyping: false, lastReadAt: null }
        ],
        messages: []
      };
      mocks.prisma.conversation.create.mockResolvedValue(newConv);

      const result = await getOrCreateConversation({
        businessId: "biz_1",
        customerId: "user_2",
        subject: "Support"
      });

      expect(result.id).toBe("conv_2");
      expect(mocks.prisma.conversation.create).toHaveBeenCalled();
    });
  });

  describe("getConversationsForUser", () => {
    it("returns conversations for a user with pagination", async () => {
      mocks.prisma.conversation.findMany.mockResolvedValue([
        {
          id: "conv_1",
          businessId: "biz_1",
          customerId: "user_1",
          subject: "Support",
          channel: "IN_APP",
          status: "ACTIVE",
          lastMessageAt: new Date(),
          createdAt: new Date(),
          participants: [
            { userId: "user_1", user: { id: "user_1", name: "Alice" }, role: "OWNER", isTyping: false, lastReadAt: null }
          ],
          messages: [
            { id: "msg_1", body: "Hello", direction: "INBOUND", status: "RECEIVED", createdAt: new Date() }
          ]
        }
      ]);

      const result = await getConversationsForUser({
        userId: "user_1",
        limit: 20
      });

      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0]!.id).toBe("conv_1");
      expect(result.nextCursor).toBeNull();
    });
  });

  describe("getConversationMessages", () => {
    it("returns messages in chronological order with pagination", async () => {
      mocks.prisma.message.findMany.mockResolvedValue([
        {
          id: "msg_2",
          body: "Response",
          direction: "OUTBOUND",
          status: "SENT",
          sentAt: new Date(),
          deliveredAt: null,
          readAt: null,
          createdAt: new Date(),
          attachments: [],
          user: { id: "staff_1", name: "Staff", image: null }
        },
        {
          id: "msg_1",
          body: "Hello",
          direction: "INBOUND",
          status: "RECEIVED",
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          createdAt: new Date(Date.now() - 1000),
          attachments: [],
          user: { id: "user_1", name: "Alice", image: null }
        }
      ]);

      const result = await getConversationMessages({
        conversationId: "conv_1",
        businessId: "biz_1",
        limit: 50
      });

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]!.body).toBe("Hello");
      expect(result.messages[1]!.body).toBe("Response");
    });
  });

  describe("markAsRead", () => {
    it("marks messages as read and updates participant lastReadAt", async () => {
      mocks.prisma.conversationParticipant.updateMany.mockResolvedValue({ count: 1 });
      mocks.prisma.message.updateMany.mockResolvedValue({ count: 3 });

      await markAsRead({
        conversationId: "conv_1",
        businessId: "biz_1",
        userId: "user_1"
      });

      expect(mocks.prisma.conversationParticipant.updateMany).toHaveBeenCalledWith({
        where: { conversationId: "conv_1", userId: "user_1" },
        data: { lastReadAt: expect.any(Date) }
      });

      expect(mocks.prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          conversationId: "conv_1",
          businessId: "biz_1",
          readAt: null,
          direction: "INBOUND"
        },
        data: { readAt: expect.any(Date) }
      });
    });
  });

  describe("addParticipant", () => {
    it("adds a participant to a conversation", async () => {
      const participant = {
        id: "part_1",
        conversationId: "conv_1",
        userId: "user_2",
        role: "MEMBER",
        isTyping: false,
        lastReadAt: null,
        joinedAt: new Date()
      };
      mocks.prisma.conversationParticipant.create.mockResolvedValue(participant);

      const result = await addParticipant({
        businessId: "biz_1",
        conversationId: "conv_1",
        userId: "user_2"
      });

      expect(result.userId).toBe("user_2");
      expect(result.role).toBe("MEMBER");
    });
  });

  describe("updateConversationStatus", () => {
    it("updates conversation status", async () => {
      const updated = {
        id: "conv_1",
        businessId: "biz_1",
        status: "ARCHIVED"
      };
      mocks.prisma.conversation.update.mockResolvedValue(updated);

      const result = await updateConversationStatus({
        businessId: "biz_1",
        conversationId: "conv_1",
        status: "ARCHIVED"
      });

      expect(result.status).toBe("ARCHIVED");
    });
  });
});
