import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { Sparkles } from "lucide-react";

import { ChatInterface } from "@/components/ai/chat-interface";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";

function getSlug(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function toBusinessName(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function BusinessChatPage() {
  const router = useRouter();
  const slug = getSlug(router.query.slug);
  const businessName = slug ? toBusinessName(slug) : "This business";

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <Card variant="hero" className="px-6 py-7 sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
          {businessName} · AI workspace
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">
          Ask anything about {businessName}
        </h1>
        <p className="mt-3 max-w-xl text-white/85">
          The answers come from the documents this business has uploaded to its
          AI co-worker. Replies are private to this business.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/80">
          <Chip variant="primary" className="bg-white/15 text-white border-white/20">
            <Sparkles className="h-3 w-3" />
            Ollama → Anthropic fallback
          </Chip>
          {slug ? (
            <Link
              href={`/sign-in?callbackUrl=/b/${slug}/chat` as Route}
              className="text-white underline"
            >
              Sign in for personalised replies
            </Link>
          ) : null}
        </div>
      </Card>

      <div className="mt-6">
        {slug ? (
          <ChatInterface businessSlug={slug} businessName={businessName} />
        ) : (
          <Card className="px-6 py-8 text-sm text-ink-muted">
            Loading business chat…
          </Card>
        )}
      </div>
    </main>
  );
}
