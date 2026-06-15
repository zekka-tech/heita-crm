import { notFound, redirect } from "next/navigation";
import { FileText, Globe, Sparkles } from "lucide-react";

import { ChatInterface } from "@/components/ai/chat-interface";
import { DocumentUploadCard } from "@/components/ai/document-upload-card";
import { WebSourcesList } from "@/components/ai/web-sources-list";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { withBusinessScope, withUserScope } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AiWorkspacePageProps = {
  params: Promise<{ businessId: string }>;
};

export default async function AiWorkspacePage({ params }: AiWorkspacePageProps) {
  const { businessId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/ai-workspace`);
  }

  const staffMembership = await withUserScope(session.user.id, (tx) =>
    tx.staffMember.findUnique({
      where: {
        businessId_userId: {
          businessId,
          userId: session.user.id
        }
      },
      select: { id: true }
    })
  );

  if (!staffMembership) notFound();

  const business = await withBusinessScope(businessId, (tx) =>
    tx.business.findUnique({
      where: { id: businessId },
      include: {
        aiWorkspace: { include: { activeConnection: true } },
        aiChatSessions: {
          where: {
            userId: session.user.id
          },
          orderBy: { updatedAt: "desc" },
          take: 1,
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              take: 20
            }
          }
        },
        documents: {
          where: { sourceType: "FILE" },
          orderBy: { createdAt: "desc" },
          take: 10
        },
        webSources: {
          orderBy: { createdAt: "desc" },
          take: 10
        }
      }
    })
  );

  if (!business) notFound();

  const docs = business.documents;
  const ready = docs.filter((doc) => doc.status === "READY").length;
  const webSources = business.webSources.map((source) => ({
    id: source.id,
    businessId: business.id,
    rootUrl: source.rootUrl,
    domain: source.domain,
    status: source.status,
    pageCount: source.pageCount,
    refreshIntervalDays: source.refreshIntervalDays,
    lastCrawledAt: source.lastCrawledAt ? source.lastCrawledAt.toISOString() : null,
    errorMessage: source.errorMessage
  }));
  const latestChatSession = business.aiChatSessions[0] ?? null;

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <div className="grid gap-5">
        <Card variant="hero" className="px-6 py-8 sm:px-10">
          <Chip variant="primary" className="bg-white/15 text-white border-white/20">
            {business.name} · AI Workspace
          </Chip>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Train your AI co-worker
          </h1>
          <p className="mt-3 max-w-2xl text-white/85">
            Upload product catalogues, FAQs, policies, and welcome flows. The
            workspace embeds them with pgvector and serves answers from Ollama,
            falling back to Anthropic on demand.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-white/85">
            <Chip variant="primary" className="bg-white/15 text-white border-white/20">
              <Sparkles className="h-3 w-3" />
              {ready}/{docs.length} documents ready
            </Chip>
            <Chip variant="primary" className="bg-white/15 text-white border-white/20">
              {business.aiWorkspace?.activeConnection
                ? `Brain: ${business.aiWorkspace.activeConnection.label || business.aiWorkspace.activeConnection.provider} · ${business.aiWorkspace.activeConnection.chatModel}`
                : `Runtime: ${business.aiWorkspace?.preferredRuntime ?? "auto"}`}
            </Chip>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-4">
            <DocumentUploadCard businessId={business.id} />
            <Card variant="surface" className="space-y-4">
              <header className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary-action" />
                <h2 className="section-title">Documents</h2>
              </header>
              {docs.length ? (
                <ul className="grid gap-2">
                  {docs.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-elevated px-3 py-3"
                    >
                      <div>
                        <p className="font-medium text-ink">{doc.title}</p>
                        <p className="text-xs text-ink-subtle">
                          {(doc.sizeBytes / 1024).toFixed(1)} KB · {" "}
                          {doc.createdAt.toLocaleDateString("en-ZA")}
                        </p>
                        {doc.errorMessage ? (
                          <p className="mt-1 text-xs text-danger">{doc.errorMessage}</p>
                        ) : null}
                      </div>
                      <Chip
                        variant={
                          doc.status === "READY"
                            ? "success"
                            : doc.status === "FAILED"
                              ? "danger"
                              : "warning"
                        }
                        size="sm"
                      >
                        {doc.status}
                      </Chip>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">
                  No documents uploaded yet. Adding documents lets the AI answer
                  customer questions from your real material.
                </p>
              )}
            </Card>
            <Card variant="surface" className="space-y-4">
              <header className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary-action" />
                <h2 className="section-title">Web sources</h2>
              </header>
              <WebSourcesList sources={webSources} />
            </Card>
          </div>

          <Card variant="outline" className="space-y-3">
            <header className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary-action" />
              <h2 className="section-title">Sandbox chat</h2>
            </header>
            <p className="text-sm text-ink-muted">
              Test how the AI responds before customers see it.
            </p>
            <ChatInterface
              businessSlug={business.slug}
              businessName={business.name}
              initialSessionId={latestChatSession?.id}
              initialMessages={latestChatSession?.messages.map((message) => ({
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
          </Card>
        </div>
      </div>
    </main>
  );
}
