import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";

import { ChatInterface } from "@/components/ai/chat-interface";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type BusinessChatPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: BusinessChatPageProps) {
  const { slug } = await params;
  return { title: `Chat · ${slug}` };
}

export default async function BusinessChatPage({ params }: BusinessChatPageProps) {
  const { slug } = await params;
  const session = await auth();
  const business = await prisma.business.findUnique({
    where: { slug },
    include: { aiWorkspace: true }
  });

  if (!business) notFound();

  const latestChatSession = session?.user?.id
    ? await prisma.aiChatSession.findFirst({
        where: {
          businessId: business.id,
          userId: session.user.id
        },
        orderBy: { updatedAt: "desc" },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 20
          }
        }
      })
    : null;

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <Card variant="hero" className="px-6 py-7 sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
          {business.name} · AI workspace
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">
          Ask anything about {business.name}
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
          {!session?.user?.id ? (
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
        <ChatInterface
          businessSlug={slug}
          businessName={business.name}
          initialSessionId={latestChatSession?.id}
          initialMessages={latestChatSession?.messages.map((message: (typeof latestChatSession.messages)[number]) => ({
            id: message.id,
            role:
              message.role === "assistant" || message.role === "system"
                ? message.role
                : "user",
            content: message.content,
            citations:
              typeof message.metadata === "object" &&
              message.metadata &&
              "citations" in message.metadata &&
              Array.isArray(message.metadata.citations)
                ? (message.metadata.citations as {
                    documentId: string;
                    documentTitle: string;
                    chunkIndex: number;
                    similarity: number;
                  }[])
                : undefined
          }))}
        />
      </div>
    </main>
  );
}
