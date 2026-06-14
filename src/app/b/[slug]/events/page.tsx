import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Calendar, Download, MapPin } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { prisma } from "@/lib/prisma";

// ISR: revalidate every 60 s. Locale-sensitive date formatting is deferred to
// the client (EventDate component) so the static shell has no request-time
// cookie/header reads.
export const revalidate = 60;

type BusinessEventsPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BusinessEventsPage({
  params
}: BusinessEventsPageProps) {
  const { slug } = await params;
  const t = await getTranslations("publicEvents");
  const business = await prisma.business.findFirst({
    where: { slug, deletedAt: null },
    include: {
      events: { orderBy: { startsAt: "asc" } }
    }
  }).catch(() => null);

  if (!business) notFound();

  const upcoming = business.events.filter(
    (event) => event.startsAt.getTime() >= Date.now()
  );

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <Breadcrumb
        crumbs={[
          { label: "Discover", href: "/discover" },
          { label: business.name, href: `/b/${slug}` },
          { label: t("eyebrow") }
        ]}
        className="mb-4"
      />
      <Card variant="hero" className="px-6 py-7 sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
          {business.name} · {t("eyebrow")}
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-xl text-white/85">
          {t("subtitle")}
        </p>
      </Card>

      <section className="mt-6 grid gap-3">
        {upcoming.length ? (
          upcoming.map((event) => (
            <Card key={event.id} variant="outline" className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary-action">
                <Calendar className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="metric-label">
                  {event.startsAt.toLocaleDateString("en-ZA", {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                  })}
                  {event.endsAt
                    ? ` · ${event.endsAt.toLocaleDateString("en-ZA", {
                        day: "2-digit",
                        month: "short"
                      })}`
                    : ""}
                </p>
                <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                  {event.title}
                </h2>
                {event.description ? (
                  <p className="mt-1 text-sm leading-6 text-ink-muted">
                    {event.description}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {event.location ? (
                    <Chip variant="primary" size="sm">
                      <MapPin className="h-3 w-3" />
                      {event.location}
                    </Chip>
                  ) : null}
                  {event.isReminderOn ? (
                    <Chip variant="success" size="sm">
                      {t("reminderOn")}
                    </Chip>
                  ) : null}
                </div>
                <a
                  href={`/api/events/${event.id}.ics`}
                  download
                  className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary-action underline"
                >
                  <Download className="h-4 w-4" />
                  {t("addToCalendar")}
                </a>
              </div>
            </Card>
          ))
        ) : (
          <Card variant="outline" className="text-center">
            <Calendar className="mx-auto h-7 w-7 text-ink-subtle" />
            <p className="mt-3 text-ink-muted">{t("empty")}</p>
            <Link
              href={`/b/${slug}` as Route}
              className="mt-2 inline-flex text-sm text-primary-action underline"
            >
              {t("backToBusiness")}
            </Link>
          </Card>
        )}
      </section>
    </main>
  );
}
