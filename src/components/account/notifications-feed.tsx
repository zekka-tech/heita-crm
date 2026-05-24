"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";

import { Chip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useTRPC } from "@/components/providers/trpc-provider";

export function NotificationsFeed() {
  const t = useTranslations("notifications");
  const trpc = useTRPC();
  const notificationsQuery = useQuery(
    trpc.notifications.recent.queryOptions(
      { limit: 50 },
      {
        staleTime: 15_000
      }
    )
  );

  if (notificationsQuery.isLoading) {
    return (
      <Card variant="outline" className="text-center">
        <Bell className="mx-auto h-7 w-7 text-ink-subtle" />
        <p className="mt-3 text-ink-muted">{t("loading")}</p>
      </Card>
    );
  }

  if (notificationsQuery.error) {
    return (
      <Card variant="outline" className="text-center">
        <Bell className="mx-auto h-7 w-7 text-ink-subtle" />
        <p className="mt-3 text-ink-muted">{t("loadError")}</p>
      </Card>
    );
  }

  const notifications = notificationsQuery.data ?? [];

  if (!notifications.length) {
    return (
      <Card variant="outline" className="text-center">
        <Bell className="mx-auto h-7 w-7 text-ink-subtle" />
        <p className="mt-3 text-ink-muted">{t("allCaughtUp")}</p>
      </Card>
    );
  }

  return (
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
                    {t("new")}
                  </Chip>
                ) : null}
              </div>
              <p className="mt-1 text-sm leading-6 text-ink-muted">
                {notification.body}
              </p>
              <p className="mt-2 text-xs text-ink-subtle">
                {notification.createdAt.toLocaleString()}
              </p>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
