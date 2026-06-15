import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ChatWindow } from "@/components/connect/chat-window";
import { auth } from "@/lib/auth";
import { withUserScope } from "@/lib/prisma";

export const metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

type ConnectPageProps = {
  searchParams?: Promise<{ businessId?: string; conversationId?: string }>;
};

export default async function ConnectPage({ searchParams }: ConnectPageProps) {
  const session = await auth();
  const t = await getTranslations("connect");

  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/connect");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};

  const memberships = await withUserScope(session.user.id, (tx) =>
    tx.membership.findMany({
      where: { userId: session.user.id },
      select: {
        businessId: true,
        business: {
          select: { id: true, name: true }
        }
      },
      orderBy: { joinedAt: "desc" },
      take: 10
    })
  );

  const activeBusinessId = resolvedSearchParams.businessId ?? memberships[0]?.businessId;

  let conversations: Array<{
    id: string;
    businessId: string;
    subject: string | null;
    channel: string;
    lastMessageAt: string | null;
    participants: Array<{ userId: string; name: string | null }>;
    lastMessage: { body: string; direction: string; createdAt: string } | null;
    unreadCount: number;
  }> = [];

  if (activeBusinessId) {
    const convs = await withUserScope(session.user.id, (tx) =>
      tx.conversation.findMany({
        where: {
          customerId: session.user.id,
          businessId: activeBusinessId
        },
        include: {
          participants: {
            include: {
              user: {
                select: { id: true, name: true }
              }
            }
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
        take: 20
      })
    );

    conversations = convs.map((conv) => {
      const convAny = conv as { participants: Array<{ userId: string; user: { name: string | null } }>; messages: Array<{ body: string; direction: string; createdAt: Date }> };
      return {
        id: conv.id,
        businessId: conv.businessId,
        subject: conv.subject,
        channel: conv.channel,
        lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
        participants: convAny.participants.map((p) => ({
          userId: p.userId,
          name: p.user.name
        })),
        lastMessage: convAny.messages[0]
          ? {
              body: convAny.messages[0].body,
              direction: convAny.messages[0].direction,
              createdAt: convAny.messages[0].createdAt.toISOString()
            }
          : null,
        unreadCount: 0
      };
    });
  }

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-ink-muted">
            {t("description")}
          </p>
        </div>
        {memberships.length > 1 ? (
          <select
            className="input w-auto"
            defaultValue={activeBusinessId}
            onChange={(e) => {
              const url = new URL(window.location.href);
              url.searchParams.set("businessId", e.target.value);
              window.location.href = url.toString();
            }}
            aria-label="Select business"
          >
            {memberships.map((m) => (
              <option key={m.businessId} value={m.businessId}>
                {m.business.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {activeBusinessId ? (
        <ChatWindow
          userId={session.user.id}
          businessId={activeBusinessId}
          conversations={conversations}
          initialConversationId={resolvedSearchParams.conversationId}
        />
      ) : (
        <p className="text-sm text-ink-muted">{t("noBusiness")}</p>
      )}
    </section>
  );
}
