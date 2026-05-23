"use client";

import { useState, useTransition } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatInterfaceProps = {
  businessSlug: string;
  businessName: string;
  initialMessages?: Message[];
};

export function ChatInterface({
  businessSlug,
  businessName,
  initialMessages
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(
    initialMessages ?? [
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
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim()
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    startStreaming(async () => {
      const placeholderId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: placeholderId, role: "assistant", content: "" }
      ]);

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessSlug,
            messages: [...messages, userMessage].map(({ role, content }) => ({
              role,
              content
            }))
          })
        });

        if (!response.ok || !response.body) {
          throw new Error("Chat unavailable.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ")) {
              acc += line.slice(6);
            }
          }
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === placeholderId ? { ...msg, content: acc } : msg
            )
          );
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
          {isStreaming ? "Replying…" : "Idle"}
        </span>
      </header>

      <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
        {messages.map((msg) => (
          <div
            key={msg.id}
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
        ))}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
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
        <Button
          type="submit"
          variant="primary"
          disabled={!input.trim() || isStreaming}
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}
