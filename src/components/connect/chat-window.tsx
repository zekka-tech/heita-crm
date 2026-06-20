"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCheck, MessageCircle, Send } from "lucide-react";

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

type TypingState = Record<string, boolean>; // userId → isTyping

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

function DeliveryTick({ status, readAt }: { status: string | null; readAt: string | null }) {
  if (status === "READ" || readAt) {
    return <CheckCheck className="inline h-3.5 w-3.5 text-sky-300" aria-label="Read" />;
  }
  if (status === "DELIVERED") {
    return <CheckCheck className="inline h-3.5 w-3.5 text-white/60" aria-label="Delivered" />;
  }
  if (status === "SENT") {
    return <Check className="inline h-3.5 w-3.5 text-white/60" aria-label="Sent" />;
  }
  return null;
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
  const [typing, setTyping] = useState<TypingState>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const getCsrf = () =>
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("__Host-heita-csrf="))
      ?.split("=")[1] ?? "";

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

  // Auto-ack delivered when entering a conversation.
  const ackDelivered = useCallback(async (conversationId: string) => {
    const msgIds = messages
      .filter((m) => m.direction === "INBOUND" && m.status !== "DELIVERED" && m.status !== "READ")
      .map((m) => m.id);
    if (!msgIds.length) return;
    try {
      await fetch("/api/connect/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-heita-csrf": getCsrf() },
        body: JSON.stringify({ conversationId, messageIds: msgIds, type: "delivered" })
      });
      setMessages((prev) =>
        prev.map((m) =>
          msgIds.includes(m.id) ? { ...m, status: "DELIVERED", deliveredAt: new Date().toISOString() } : m
        )
      );
    } catch {
      // Non-critical — backend will retry.
    }
  }, [messages]);

  useEffect(() => {
    if (!activeConversationId) return;
    fetchMessages(activeConversationId);
  }, [activeConversationId, fetchMessages]);

  // Ack delivered after messages load.
  useEffect(() => {
    if (activeConversationId && messages.length) {
      ackDelivered(activeConversationId);
    }
    // Only run when messages or conversation changes, not on every ackDelivered reference change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, messages.length]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // SSE: handle message.new, typing, and message.status_update events.
  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as {
          type: string;
          message?: Message;
          conversationId?: string;
          userId?: string;
          isTyping?: boolean;
          messageId?: string;
          status?: string;
          deliveredAt?: string;
          readAt?: string;
        };

        if (data.type === "message.new" && data.message) {
          const msg = data.message;
          if (msg.conversationId === activeConversationId) {
            setMessages((prev) => [...prev, msg]);
          }
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === msg.conversationId
                ? {
                    ...conv,
                    lastMessage: { body: msg.body, direction: msg.direction, createdAt: msg.sentAt ?? "" },
                    unreadCount: conv.id === activeConversationId ? 0 : conv.unreadCount + 1
                  }
                : conv
            )
          );
        }

        if (data.type === "typing" && data.conversationId === activeConversationId && data.userId && data.userId !== userId) {
          const uid = data.userId;
          setTyping((prev) => ({ ...prev, [uid]: data.isTyping ?? false }));
          // Auto-clear typing indicator after 6 s if no stop event arrives.
          if (typingTimersRef.current[uid]) clearTimeout(typingTimersRef.current[uid]);
          if (data.isTyping) {
            typingTimersRef.current[uid] = setTimeout(() => {
              setTyping((prev) => ({ ...prev, [uid]: false }));
            }, 6_000);
          }
        }

        if (data.type === "message.status_update" && data.messageId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.messageId
                ? { ...m, status: data.status ?? m.status, deliveredAt: data.deliveredAt ?? m.deliveredAt, readAt: data.readAt ?? m.readAt }
                : m
            )
          );
        }
      } catch {
        // Ignore malformed events.
      }
    };

    const connect = () => {
      if (closed) return;
      const next = new EventSource("/api/connect/stream");
      next.addEventListener("message", handleMessage);
      next.onerror = () => {
        next.close();
        if (eventSourceRef.current === next) eventSourceRef.current = null;
        if (closed) return;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, 5000);
      };
      source = next;
      eventSourceRef.current = next;
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      source?.close();
      eventSourceRef.current = null;
    };
  }, [activeConversationId, userId]);

  // Heartbeat presence — keeps the user marked online every 20 s.
  useEffect(() => {
    const sendHeartbeat = async () => {
      try {
        await fetch("/api/connect/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-heita-csrf": getCsrf() },
          body: JSON.stringify({ action: "heartbeat" })
        });
      } catch { /* ignore */ }
    };
    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 20_000);
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, []);

  // Typing indicator — send typing_start on input, debounced typing_stop.
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingSentRef = useRef(false);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (!activeConversationId) return;

    if (!isTypingSentRef.current) {
      isTypingSentRef.current = true;
      fetch("/api/connect/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-heita-csrf": getCsrf() },
        body: JSON.stringify({ action: "typing_start", conversationId: activeConversationId })
      }).catch(() => {});
    }

    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      isTypingSentRef.current = false;
      fetch("/api/connect/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-heita-csrf": getCsrf() },
        body: JSON.stringify({ action: "typing_stop", conversationId: activeConversationId })
      }).catch(() => {});
    }, 3_000);
  }, [activeConversationId]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !activeConversationId) return;

    // Stop typing indicator immediately on send.
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (isTypingSentRef.current) {
      isTypingSentRef.current = false;
      fetch("/api/connect/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-heita-csrf": getCsrf() },
        body: JSON.stringify({ action: "typing_stop", conversationId: activeConversationId })
      }).catch(() => {});
    }

    setSending(true);
    try {
      const response = await fetch("/api/connect/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-heita-csrf": getCsrf() },
        body: JSON.stringify({ conversationId: activeConversationId, businessId, content: trimmed })
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
  const activeConvParticipants = activeConversation?.participants ?? [];
  const typingNames = activeConvParticipants
    .filter((p) => p.userId !== userId && typing[p.userId])
    .map((p) => p.name ?? "Someone");

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
                          "mt-1.5 flex items-center justify-end gap-1 text-xs",
                          isOutbound ? "text-white/75" : "text-ink-subtle"
                        )}
                      >
                        <span>{msg.sentAt ? formatTime(msg.sentAt) : ""}</span>
                        {isOutbound ? (
                          <DeliveryTick status={msg.status} readAt={msg.readAt} />
                        ) : null}
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

            {typingNames.length > 0 ? (
              <p className="text-xs text-ink-muted" aria-live="polite">
                {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
              </p>
            ) : null}

            <div className="flex items-center gap-3 border-t border-line pt-4">
              <input
                type="text"
                value={input}
                onChange={handleInputChange}
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
