"use client";

import { useState, useTransition } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Citation = {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  similarity: number;
};

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
};

type ChatInterfaceProps = {
  businessSlug: string;
  businessName: string;
  initialSessionId?: string | null;
  initialMessages?: Message[];
};

function parseEventBlock(block: string) {
  const lines = block.split("\n");
  let event = "message";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      event = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      data += line.slice(6);
    }
  }

  return { event, data };
}

export function ChatInterface({
  businessSlug,
  businessName,
  initialSessionId,
  initialMessages
}: ChatInterfaceProps) {
  const [sessionId, setSessionId] = useState(initialSessionId ?? null);
  const [messages, setMessages] = useState<Message[]>(
    initialMessages?.length
      ? initialMessages
      : [
          {
            id: "intro",
            role: "assistant",
            content: `Hi! I'm the ${businessName} AI co-worker. Ask me about products, hours, rewards, or how to redeem your points.`
          }
        ]
  );
  const [input, setInput] = useState("");
  const [isStreaming, startStreaming] = useTransition();

  const submit = () => {
    if (!input.trim()) return;
    const messageText = input.trim();
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    startStreaming(async () => {
      const placeholderId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: placeholderId, role: "assistant", content: "", citations: [] }
      ]);

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessSlug,
            sessionId,
            message: messageText
          })
        });

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Chat unavailable.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantContent = "";
        let citations: Citation[] = [];

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const block of events) {
            const parsed = parseEventBlock(block);
            if (!parsed.data && parsed.event !== "done") {
              continue;
            }

            if (parsed.event === "session") {
              const payload = JSON.parse(parsed.data) as { sessionId: string };
              setSessionId(payload.sessionId);
              continue;
            }

            if (parsed.event === "citations") {
              const payload = JSON.parse(parsed.data) as { citations: Citation[] };
              citations = payload.citations;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === placeholderId ? { ...msg, citations } : msg
                )
              );
              continue;
            }

            if (parsed.event === "error") {
              const payload = JSON.parse(parsed.data) as { message: string };
              throw new Error(payload.message);
            }

            if (parsed.event === "done") {
              continue;
            }

            const payload = JSON.parse(parsed.data) as { chunk: string };
            assistantContent += payload.chunk;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === placeholderId
                  ? { ...msg, content: assistantContent, citations }
                  : msg
              )
            );
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Chat unavailable";
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === placeholderId ? { ...msg, content: message } : msg
          )
        );
      }
    });
  };

  return (
    <Card variant="surface" className="grid gap-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
          <Sparkles className="h-4 w-4 text-primary-action" />
          Conversation
        </div>
        <span className="text-xs text-ink-subtle">
          {isStreaming ? "Replying…" : sessionId ? "Saved" : "New session"}
        </span>
      </header>

      <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
        {messages.map((msg) => (
          <div key={msg.id} className="grid gap-2">
            <div
              className={cn(
                "max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6",
                msg.role === "user"
                  ? "ml-auto bg-primary text-white shadow-glow"
                  : "mr-auto border border-line bg-surface-elevated text-ink"
              )}
            >
              {msg.content || (
                <span className="inline-flex items-center gap-2 text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking
                </span>
              )}
            </div>
            {msg.role === "assistant" && msg.citations?.length ? (
              <div className="mr-auto flex max-w-[90%] flex-wrap gap-2">
                {msg.citations.map((citation) => (
                  <span
                    key={`${citation.documentId}:${citation.chunkIndex}`}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-muted"
                  >
                    {citation.documentTitle} · chunk {citation.chunkIndex + 1}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor="chat-input" className="sr-only">Message</label>
        <textarea
          id="chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={1}
          placeholder="Ask about products, hours, rewards…"
          className="input min-h-[2.75rem] flex-1 resize-none"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button type="submit" variant="primary" disabled={!input.trim() || isStreaming}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}
