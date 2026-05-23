import { redirect } from "next/navigation";
import { Bell } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/notifications");
  }

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return (
    <section className="grid gap-5">
      <Card variant="hero" className="px-6 py-8 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
          Notifications
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold">Recent updates</h1>
        <p className="mt-2 text-sm text-white/80">
          Tier upgrades, redemptions, event reminders, and bot replies appear here.
        </p>
      </Card>

      {notifications.length ? (
        <ul className="grid gap-3">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <Card variant="outline" className="flex items-start gap-3">
                <div
                  className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full ${notification.isRead ? "bg-line text-ink-subtle" : "bg-primary text-white"}`}
                >
                  <Bell className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-display text-base font-semibold text-ink">
                      {notification.title}
                    </p>
                    {!notification.isRead ? (
                      <Chip variant="primary" size="sm">
                        New
                      </Chip>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-ink-muted">
                    {notification.body}
                  </p>
                  <p className="mt-2 text-xs text-ink-subtle">
                    {notification.createdAt.toLocaleString("en-ZA")}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card variant="outline" className="text-center">
          <Bell className="mx-auto h-7 w-7 text-ink-subtle" />
          <p className="mt-3 text-ink-muted">All caught up.</p>
        </Card>
      )}
    </section>
  );
}
