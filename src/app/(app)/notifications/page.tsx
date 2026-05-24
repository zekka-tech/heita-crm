import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { NotificationsFeed } from "@/components/account/notifications-feed";
import { Card } from "@/components/ui/card";
import { auth } from "@/lib/auth";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const session = await auth();
  const t = await getTranslations("notifications");

  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/notifications");
  }

  return (
    <section className="grid gap-5">
      <Card variant="hero" className="px-6 py-8 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
          {t("eyebrow")}
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold">{t("title")}</h1>
        <p className="mt-2 text-sm text-white/80">{t("blurb")}</p>
      </Card>

      <NotificationsFeed />
    </section>
  );
}
