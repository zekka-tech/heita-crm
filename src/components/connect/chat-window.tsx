"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  conversationId: string;
  body: string;
  direction: string;
  status: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  senderId?: string;
  user?: { id: string; name: string | null; image: string | null };
  attachments?: { id: string; mediaType: string; fileName: string | null; sourceUrl: string | null }[];
};

type Conversation = {
  id: string;
  businessId: string;
  subject: string | null;
  channel: string;
  lastMessageAt: string | null;
  participants: { userId: string; name: string | null }[];
  lastMessage: { body: string; direction: string; createdAt: string } | null;
  unreadCount: number;
};

type ChatWindowProps = {
  userId: string;
  businessId: string;
  conversations: Conversation[];
  initialConversationId?: string;
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status: string | null): string {
  switch (status) {
    case "SENT": return "Sent";
    case "DELIVERED": return "Delivered";
    case "READ": return "Read";
    case "FAILED": return "Failed";
    default: return "";
  }
}

export function ChatWindow({
  userId,
  businessId,
  conversations: initialConversations,
  initialConversationId
}: ChatWindowProps) {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId ?? null
  );
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      const response = await fetch(
        `/api/connect/messages?conversationId=${conversationId}&businessId=${businessId}`
      );
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages ?? []);
      }
    } catch {
      // Silently fail; SSE will deliver new messages.
    }
  }, [businessId]);

  useEffect(() => {
    if (!activeConversationId) return;
    fetchMessages(activeConversationId);
  }, [activeConversationId, fetchMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const source = new EventSource("/api/connect/stream");

    source.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "message.new" && data.message) {
          const msg = data.message as Message;
          if (msg.conversationId === activeConversationId) {
            setMessages((prev) => [...prev, msg]);
          }
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === msg.conversationId
                ? { ...conv, lastMessage: { body: msg.body, direction: msg.direction, createdAt: msg.sentAt ?? "" }, unreadCount: conv.id === activeConversationId ? conv.unreadCount : conv.unreadCount + 1 }
                : conv
            )
          );
        }
      } catch {
        // Ignore malformed events.
      }
    });

    eventSourceRef.current = source;

    source.onerror = () => {
      source.close();
      setTimeout(() => {
        if (eventSourceRef.current === source) {
          const newSource = new EventSource("/api/connect/stream");
          eventSourceRef.current = newSource;
        }
      }, 5000);
    };

    return () => {
      source.close();
      eventSourceRef.current = null;
    };
  }, [activeConversationId, userId]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !activeConversationId) return;

    setSending(true);
    try {
      const csrfToken = document.cookie
        .split("; ")
        .find((row) => row.startsWith("__Host-heita-csrf="))
        ?.split("=")[1] ?? "";

      const response = await fetch("/api/connect/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-heita-csrf": csrfToken
        },
        body: JSON.stringify({
          conversationId: activeConversationId,
          businessId,
          content: trimmed
        })
      });

      if (response.ok) {
        setInput("");
      }
    } catch {
      // Retry on next send attempt.
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  return (
    <div className="grid gap-4 lg:grid-cols-[0.36fr_0.64fr]">
      <Card variant="surface" className="space-y-3">
        <CardHeader
          title="Messages"
          action={
            <span className="text-xs text-ink-subtle">{conversations.length} threads</span>
          }
        />
        {conversations.length ? (
          <div className="grid gap-2">
            {conversations.map((conv) => {
              const active = conv.id === activeConversationId;
              const participantName =
                conv.participants.find((p) => p.userId !== userId)?.name ?? "Customer";
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left transition",
                    active
                      ? "border-primary-action bg-primary-action/5"
                      : "border-line bg-surface-elevated hover:border-primary-action/40"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">
                        {conv.subject || participantName}
                      </p>
                      <p className="text-xs text-ink-subtle">{conv.channel}</p>
                    </div>
                    {conv.unreadCount > 0 ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">
                        {conv.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  {conv.lastMessage ? (
                    <p className="mt-2 line-clamp-2 text-sm text-ink-muted">
                      {conv.lastMessage.direction === "OUTBOUND" ? "You: " : ""}
                      {conv.lastMessage.body}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No conversations yet.</p>
        )}
      </Card>

      <Card variant="surface" className="space-y-4">
        <header className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary-action" />
          <h2 className="section-title">
            {activeConversation?.subject ?? "Select a conversation"}
          </h2>
        </header>

        {activeConversation ? (
          <>
            <div className="grid max-h-[26rem] gap-3 overflow-y-auto pr-1">
              {messages.map((msg) => {
                const isOutbound = msg.direction === "OUTBOUND" || msg.senderId === userId;
                return (
                  <div key={msg.id} className="grid gap-2">
                    <div
                      className={cn(
                        "max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6",
                        isOutbound
                          ? "ml-auto bg-primary text-white"
                          : "mr-auto border border-line bg-surface-elevated text-ink"
                      )}
                    >
                      {msg.body}
                      <div
                        className={cn(
                          "mt-2 text-xs",
                          isOutbound ? "text-white/75" : "text-ink-subtle"
                        )}
                      >
                        {msg.sentAt ? formatTime(msg.sentAt) : ""}
                        {msg.status && isOutbound ? ` \u00b7 ${statusLabel(msg.status)}` : ""}
                      </div>
                    </div>
                    {msg.attachments?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {msg.attachments.map((att) => (
                          <a
                            key={att.id}
                            href={att.sourceUrl ?? "#"}
                            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-muted"
                            aria-label={`Attachment: ${att.fileName ?? att.mediaType}`}
                          >
                            {att.fileName ?? att.mediaType}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex items-center gap-3 border-t border-line pt-4">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="input flex-1"
                aria-label="Message input"
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                variant="primary"
                size="sm"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            Select a conversation to view and send messages.
          </p>
        )}
      </Card>
    </div>
  );
}
