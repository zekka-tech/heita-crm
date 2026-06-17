import { StaffRole } from "@prisma/client";
import { MessageCircle, Paperclip, Send } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { sendWhatsappReplyAction } from "@/app/dashboard/[businessId]/messages/actions";
import { CsrfField } from "@/components/security/csrf-field";
import { Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { isBuildPhase } from "@/lib/build-phase";

export const dynamic = "force-dynamic";

type MessagesPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ contactPhone?: string; sent?: string; channel?: string; conversationId?: string }>;
};

function channelBadge(channel: string) {
  const labels: Record<string, string> = {
    WHATSAPP: "WA",
    IN_APP: "In-App",
    SMS: "SMS",
    EMAIL: "Email",
    PUSH: "Push"
  };
  return labels[channel] ?? channel;
}

const TABS = [
  { key: "whatsapp", label: "WhatsApp", icon: null },
  { key: "in-app", label: "In-App", icon: null },
  { key: "all", label: "All Channels", icon: null }
] as const;

export default async function DashboardMessagesPage({
  params,
  searchParams
}: MessagesPageProps) {
  const { businessId } = await params;

  if (isBuildPhase()) {
    return <main className="px-4 pb-24 pt-6 sm:px-8" />;
  }

  const [
    { auth },
    { requireRole },
    {
      withBusinessScope
    },
    {
      getBusinessConversationThread,
      getWhatsappCustomerServiceWindowStatus,
      listBusinessConversations
    }
  ] = await Promise.all([
    import("@/lib/auth"),
    import("@/lib/staff"),
    import("@/lib/prisma"),
    import("@/server/services/conversation.service")
  ]);
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

  const userId = session.user.id;
  // Scoped read: the staffMembers authorization subquery is RLS-gated under the
  // app role (else null → 404). Staff access already enforced by layout + requireRole.
  const business = await withBusinessScope(businessId, (tx) =>
    tx.business.findFirst({
      where: {
        id: businessId,
        deletedAt: null,
        staffMembers: {
          some: {
            userId
          }
        }
      }
    })
  );

  if (!business) {
    notFound();
  }

  const activeChannel = resolvedSearchParams.channel ?? "whatsapp";

  const whatsappConversations = await listBusinessConversations({ businessId });

  let inAppConversations: {
    id: string;
    customerId: string;
    subject: string | null;
    customerName: string | null;
    customerPhone: string | null;
    lastMessageAt: Date | null;
    lastMessageBody: string | null;
    lastDirection: string | null;
    status: string;
    unreadCount: number;
  }[] = [];

  if (activeChannel === "in-app" || activeChannel === "all") {
    inAppConversations = await withBusinessScope(businessId, async (tx) => {
      const convs = await tx.conversation.findMany({
        where: {
          businessId,
          channel: "IN_APP"
        },
        include: {
          customer: {
            select: { id: true, name: true, phone: true }
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              body: true,
              direction: true,
              createdAt: true
            }
          }
        },
        orderBy: { lastMessageAt: "desc" },
        take: 50
      });

      return convs.map((conv) => ({
        id: conv.id,
        customerId: conv.customerId,
        subject: conv.subject,
        customerName: conv.customer.name,
        customerPhone: conv.customer.phone,
        lastMessageAt: conv.lastMessageAt,
        lastMessageBody: conv.messages[0]?.body ?? null,
        lastDirection: conv.messages[0]?.direction ?? null,
        status: conv.status,
        unreadCount: 0
      }));
    });
  }

  const selectedInAppId =
    activeChannel === "in-app" && resolvedSearchParams.conversationId
      ? resolvedSearchParams.conversationId
      : null;

  let inAppThread: Awaited<ReturnType<typeof withBusinessScope>> | null = null;
  if (selectedInAppId) {
    inAppThread = await withBusinessScope(businessId, (tx) =>
      tx.message.findMany({
        where: {
          businessId,
          conversationId: selectedInAppId
        },
        include: {
          attachments: {
            orderBy: { createdAt: "asc" }
          },
          user: {
            select: { id: true, name: true }
          }
        },
        orderBy: { createdAt: "asc" },
        take: 100
      })
    );
  }

  const activeContactPhone =
    activeChannel === "whatsapp"
      ? (resolvedSearchParams.contactPhone ?? whatsappConversations[0]?.contactPhone ?? null)
      : null;

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

  const allConversations = [
    ...whatsappConversations.map((c) => ({
      key: c.contactPhone,
      channel: "WHATSAPP" as const,
      displayName: c.name || c.contactPhone,
      subtext: c.contactPhone,
      lastMessageBody: c.lastMessageBody,
      lastDirection: c.lastDirection,
      unreadCount: c.unreadCount,
      link: `/dashboard/${businessId}/messages?channel=whatsapp&contactPhone=${encodeURIComponent(c.contactPhone)}`
    })),
    ...inAppConversations.map((c) => ({
      key: c.id,
      channel: "IN_APP" as const,
      displayName: c.subject || c.customerName || c.customerPhone || "Customer",
      subtext: "In-App",
      lastMessageBody: c.lastMessageBody,
      lastDirection: c.lastDirection,
      unreadCount: c.unreadCount,
      link: `/dashboard/${businessId}/messages?channel=in-app&conversationId=${c.id}`
    }))
  ];

  const filteredConversations =
    activeChannel === "all"
      ? allConversations
      : activeChannel === "in-app"
        ? allConversations.filter((c) => c.channel === "IN_APP")
        : allConversations.filter((c) => c.channel === "WHATSAPP");

  const activeKey =
    activeChannel === "whatsapp"
      ? activeContactPhone
      : activeChannel === "in-app"
        ? selectedInAppId
        : activeContactPhone ?? selectedInAppId;

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <div className="grid gap-5">
        <Card variant="hero" className="px-6 py-7 sm:px-10">
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Staff conversations
          </h1>
          <p className="mt-2 max-w-2xl text-white/85">
            View inbound threads across channels, inspect attachments, and reply.
          </p>
        </Card>

        <nav className="flex gap-2" aria-label="Channel tabs">
          {TABS.map((tab) => {
            const active = activeChannel === tab.key;
            return (
              <Link
                key={tab.key}
                href={`/dashboard/${businessId}/messages?channel=${tab.key}`}
                className={[
                  "rounded-full px-4 py-2 text-sm font-medium transition",
                  active
                    ? "bg-primary text-white"
                    : "bg-surface-elevated text-ink-muted hover:text-ink"
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="grid gap-4 lg:grid-cols-[0.36fr_0.64fr]">
          <Card variant="surface" className="space-y-3">
            <header className="flex items-center justify-between">
              <h2 className="section-title">Conversations</h2>
              <span className="text-xs text-ink-subtle">{filteredConversations.length} threads</span>
            </header>
            {filteredConversations.length ? (
              <div className="grid gap-2">
                {filteredConversations.map((conversation) => {
                  const active = conversation.key === activeKey;
                  return (
                    <Link
                      key={conversation.key}
                      href={conversation.link as unknown as import("next").Route<string>}
                      className={[
                        "rounded-xl border px-4 py-3 text-left transition",
                        active
                          ? "border-primary-action bg-primary-action/5"
                          : "border-line bg-surface-elevated hover:border-primary-action/40"
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-ink">
                              {conversation.displayName}
                            </p>
                            <Chip variant="default" className="text-[0.625rem]">
                              {channelBadge(conversation.channel)}
                            </Chip>
                          </div>
                          <p className="text-xs text-ink-subtle">{conversation.subtext}</p>
                        </div>
                        {conversation.unreadCount > 0 ? (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">
                            {conversation.unreadCount}
                          </span>
                        ) : null}
                      </div>
                      {conversation.lastMessageBody ? (
                        <p className="mt-2 line-clamp-2 text-sm text-ink-muted">
                          {conversation.lastDirection === "OUTBOUND" ? "You: " : ""}
                          {conversation.lastMessageBody}
                        </p>
                      ) : null}
                    </Link>
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
                {activeKey
                  ? (activeChannel === "in-app"
                      ? (inAppConversations.find((c) => c.id === activeKey)?.subject ??
                         inAppConversations.find((c) => c.id === activeKey)?.customerName ??
                         "Customer")
                      : activeContactPhone)
                  : "Select a conversation"}
              </h2>
            </header>

            {activeKey && activeChannel === "in-app" && inAppThread ? (
              <>
                <div className="grid max-h-[26rem] gap-3 overflow-y-auto pr-1">
                  {(inAppThread as {
                    id: string;
                    body: string;
                    direction: string;
                    status: string | null;
                    createdAt: Date;
                    sentAt: Date | null;
                    attachments: { id: string; fileName: string | null; sourceUrl: string | null; mediaType: string }[];
                  }[]).map((message) => (
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
                          {(message.sentAt ?? message.createdAt).toLocaleString("en-ZA")}
                          {message.status ? ` \u00b7 ${message.status}` : ""}
                        </div>
                      </div>
                      {message.attachments.length ? (
                        <div className="flex flex-wrap gap-2">
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
              </>
            ) : activeContactPhone ? (
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
                          {message.status ? ` \u00b7 ${message.status}` : ""}
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
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="label-stack">
                      <span className="label">Message mode</span>
                      <select name="messageMode" defaultValue="text" className="input">
                        <option value="text">Free-text reply</option>
                        <option value="template">Template</option>
                        <option value="interactive-buttons">Interactive buttons</option>
                        <option value="interactive-list">Interactive list</option>
                      </select>
                    </label>
                    <Input
                      name="footer"
                      label="Footer (optional)"
                      placeholder="Reply terms or short footer"
                    />
                  </div>
                  <Input
                    name="templateName"
                    label="Template name"
                    placeholder="Optional approved template name"
                    hint="If you set a template name, the body is passed as a single body parameter."
                  />
                  <Textarea
                    name="interactiveButtons"
                    label="Interactive buttons"
                    rows={3}
                    placeholder={"join_now|Join now\nview_rewards|View rewards"}
                    hint="For button mode: one button per line as id|title, up to 3 buttons."
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      name="listButtonLabel"
                      label="List button label"
                      placeholder="Choose an option"
                    />
                    <Input
                      name="listSectionTitle"
                      label="List section title"
                      placeholder="Available actions"
                    />
                  </div>
                  <Textarea
                    name="interactiveListRows"
                    label="Interactive list rows"
                    rows={4}
                    placeholder={"join|Join programme|Claim welcome points\nredeem|Redeem reward|Use points now"}
                    hint="For list mode: one row per line as id|title|description, up to 10 rows."
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
                Select a conversation to inspect the thread and send a reply.
              </p>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
