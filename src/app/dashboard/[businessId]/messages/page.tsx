import { StaffRole } from "@prisma/client";
import { MessageCircle, Paperclip, Send } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { sendWhatsappReplyAction } from "@/app/dashboard/[businessId]/messages/actions";
import { CsrfField } from "@/components/security/csrf-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/staff";
import { prisma } from "@/lib/prisma";
import {
  getBusinessConversationThread,
  getWhatsappCustomerServiceWindowStatus,
  listBusinessConversations
} from "@/server/services/conversation.service";

type MessagesPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ contactPhone?: string; sent?: string }>;
};

export default async function DashboardMessagesPage({
  params,
  searchParams
}: MessagesPageProps) {
  const { businessId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/messages`);
  }

  await requireRole({
    businessId,
    userId: session.user.id,
    allowedRoles: [StaffRole.STAFF]
  });

  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      staffMembers: {
        some: {
          userId: session.user.id
        }
      }
    }
  });

  if (!business) {
    notFound();
  }

  const conversations = await listBusinessConversations({ businessId });
  const activeContactPhone =
    resolvedSearchParams.contactPhone ?? conversations[0]?.contactPhone ?? null;
  const thread = activeContactPhone
    ? await getBusinessConversationThread({
        businessId,
        contactPhone: activeContactPhone
      })
    : [];
  const serviceWindow = activeContactPhone
    ? await getWhatsappCustomerServiceWindowStatus({
        businessId,
        contactPhone: activeContactPhone
      })
    : null;

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <div className="grid gap-5">
        <Card variant="hero" className="px-6 py-7 sm:px-10">
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Staff conversations
          </h1>
          <p className="mt-2 max-w-2xl text-white/85">
            View inbound WhatsApp threads, inspect attachments, and reply with free-form
            text or a pre-approved template.
          </p>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[0.36fr_0.64fr]">
          <Card variant="surface" className="space-y-3">
            <header className="flex items-center justify-between">
              <h2 className="section-title">Conversations</h2>
              <span className="text-xs text-ink-subtle">{conversations.length} threads</span>
            </header>
            {conversations.length ? (
              <div className="grid gap-2">
                {conversations.map((conversation) => {
                  const active = conversation.contactPhone === activeContactPhone;
                  return (
                    <a
                      key={conversation.contactPhone}
                      href={`/dashboard/${businessId}/messages?contactPhone=${encodeURIComponent(conversation.contactPhone)}`}
                      className={[
                        "rounded-xl border px-4 py-3 text-left transition",
                        active
                          ? "border-primary-action bg-primary-action/5"
                          : "border-line bg-surface-elevated hover:border-primary-action/40"
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-ink">
                            {conversation.name || conversation.contactPhone}
                          </p>
                          <p className="text-xs text-ink-subtle">{conversation.contactPhone}</p>
                        </div>
                        {conversation.unreadCount > 0 ? (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">
                            {conversation.unreadCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-ink-muted">
                        {conversation.lastDirection === "OUTBOUND" ? "You: " : ""}
                        {conversation.lastMessageBody}
                      </p>
                    </a>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">No WhatsApp conversations yet.</p>
            )}
          </Card>

          <Card variant="surface" className="space-y-4">
            <header className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary-action" />
              <h2 className="section-title">
                {activeContactPhone ?? "Select a conversation"}
              </h2>
            </header>

            {activeContactPhone ? (
              <>
                <div className="grid max-h-[26rem] gap-3 overflow-y-auto pr-1">
                  {thread.map((message) => (
                    <div key={message.id} className="grid gap-2">
                      <div
                        className={[
                          "max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6",
                          message.direction === "OUTBOUND"
                            ? "ml-auto bg-primary text-white"
                            : "mr-auto border border-line bg-surface-elevated text-ink"
                        ].join(" ")}
                      >
                        {message.body}
                        <div
                          className={[
                            "mt-2 text-xs",
                            message.direction === "OUTBOUND"
                              ? "text-white/75"
                              : "text-ink-subtle"
                          ].join(" ")}
                        >
                          {message.createdAt.toLocaleString("en-ZA")}
                          {message.status ? ` · ${message.status}` : ""}
                        </div>
                      </div>
                      {message.attachments.length ? (
                        <div className="mr-auto flex max-w-[92%] flex-wrap gap-2">
                          {message.attachments.map((attachment) => (
                            <a
                              key={attachment.id}
                              href={attachment.sourceUrl ?? "#"}
                              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-muted"
                            >
                              <Paperclip className="h-3 w-3" />
                              {attachment.fileName ?? attachment.mediaType}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <form action={sendWhatsappReplyAction} className="grid gap-3 border-t border-line pt-4">
                  <CsrfField />
                  <input type="hidden" name="businessId" value={businessId} />
                  <input type="hidden" name="contactPhone" value={activeContactPhone} />
                  <div
                    className={[
                      "rounded-xl border px-4 py-3 text-sm",
                      serviceWindow?.open
                        ? "border-success/30 bg-success/10 text-ink"
                        : "border-warning/30 bg-warning/10 text-ink"
                    ].join(" ")}
                  >
                    {serviceWindow?.open
                      ? `Free-text replies are allowed until ${serviceWindow.expiresAt?.toLocaleString("en-ZA")}.`
                      : "The 24-hour customer-service window is closed. Send an approved WhatsApp template unless the customer messages again."}
                  </div>
                  <Textarea
                    name="body"
                    label="Reply text"
                    rows={4}
                    placeholder="Write a WhatsApp reply"
                  />
                  <Input
                    name="templateName"
                    label="Template name"
                    placeholder="Optional approved template name"
                    hint="If you set a template name, the body is passed as a single body parameter."
                  />
                  <div className="flex items-center justify-between gap-3">
                    {resolvedSearchParams.sent ? (
                      <p className="text-sm text-success">Message sent.</p>
                    ) : (
                      <span className="text-sm text-ink-subtle">
                        Text replies are sent immediately through the connected WABA number.
                      </span>
                    )}
                    <Button type="submit" variant="primary">
                      <Send className="h-4 w-4" />
                      Send reply
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              <p className="text-sm text-ink-muted">
                Select a contact to inspect the thread and send a reply.
              </p>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
