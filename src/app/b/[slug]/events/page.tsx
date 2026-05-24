import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar, MapPin } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";

type BusinessEventsPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BusinessEventsPage({
  params
}: BusinessEventsPageProps) {
  const { slug } = await params;
  const business = await prisma.business.findFirst({
    where: { slug, deletedAt: null },
    include: {
      events: { orderBy: { startsAt: "asc" } }
    }
  });

  if (!business) notFound();

  const upcoming = business.events.filter(
    (event) => event.startsAt.getTime() >= Date.now()
  );

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <Card variant="hero" className="px-6 py-7 sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
          {business.name} · Events
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">
          What&apos;s coming up
        </h1>
        <p className="mt-3 max-w-xl text-white/85">
          Reminders fire across WhatsApp, push, and the app feed the day before.
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
                      Reminder on
                    </Chip>
                  ) : null}
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card variant="outline" className="text-center">
            <Calendar className="mx-auto h-7 w-7 text-ink-subtle" />
            <p className="mt-3 text-ink-muted">No upcoming events.</p>
            <Link
              href={`/b/${slug}` as Route}
              className="mt-2 inline-flex text-sm text-primary-action underline"
            >
              Back to business profile
            </Link>
          </Card>
        )}
      </section>
    </main>
  );
}
