import { StaffRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Bell, Calendar, MapPin, Sparkles, Trash2 } from "lucide-react";

import {
  createEventAction,
  deleteEventAction,
  updateEventAction
} from "@/app/dashboard/[businessId]/events/actions";
import { CsrfField } from "@/components/security/csrf-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import { listEventsForStaff } from "@/server/services/events.service";

export const dynamic = "force-dynamic";

type EventsDashboardPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ updated?: string }>;
};

function toInputDateTime(value: Date): string {
  return value.toISOString().slice(0, 16);
}

export default async function EventsDashboardPage({
  params,
  searchParams
}: EventsDashboardPageProps) {
  const { businessId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const session = await auth();
  const t = await getTranslations("events");

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/events`);
  }

  await requireRole({
    businessId,
    userId: session.user.id,
    allowedRoles: [StaffRole.MANAGER]
  });

  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      deletedAt: null,
      staffMembers: { some: { userId: session.user.id } }
    },
    select: { id: true, name: true }
  });

  if (!business) notFound();

  const events = await listEventsForStaff({
    businessId,
    userId: session.user.id
  });

  const upcoming = events.filter((event) => !event.isPast);
  const past = events.filter((event) => event.isPast).reverse();

  const now = new Date();
  const defaultStartsAt = toInputDateTime(now);
  const defaultEndsAt = toInputDateTime(
    new Date(now.getTime() + 2 * 60 * 60 * 1000)
  );

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <div className="grid gap-5">
        <Card variant="hero" className="px-6 py-7 sm:px-10">
          <Chip variant="primary" className="bg-white/15 text-white border-white/20">
            {business.name} · {t("title")}
          </Chip>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-2xl text-white/85">{t("subtitle")}</p>
        </Card>

        {resolvedSearchParams.updated ? (
          <Card variant="surface" className="text-sm text-success">
            {resolvedSearchParams.updated === "created" ? t("createdSuccess") : null}
            {resolvedSearchParams.updated === "updated" ? t("updatedSuccess") : null}
            {resolvedSearchParams.updated === "deleted" ? t("deletedSuccess") : null}
          </Card>
        ) : null}

        <Card variant="surface" className="space-y-4">
          <header className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary-action" />
            <h2 className="section-title">{t("createCta")}</h2>
          </header>
          <form action={createEventAction} className="grid gap-3 md:grid-cols-2">
            <CsrfField />
            <input type="hidden" name="businessId" value={business.id} />
            <Input
              name="title"
              label={t("formLabels.title")}
              placeholder={t("formLabels.titlePlaceholder")}
              required
              className="md:col-span-2"
            />
            <Textarea
              name="description"
              label={t("formLabels.description")}
              rows={3}
              placeholder={t("formLabels.descriptionPlaceholder")}
              className="md:col-span-2"
            />
            <Input
              name="startsAt"
              label={t("formLabels.startsAt")}
              type="datetime-local"
              defaultValue={defaultStartsAt}
              required
            />
            <Input
              name="endsAt"
              label={t("formLabels.endsAt")}
              type="datetime-local"
              defaultValue={defaultEndsAt}
            />
            <Input
              name="location"
              label={t("formLabels.location")}
              placeholder={t("formLabels.locationPlaceholder")}
              className="md:col-span-2"
            />
            <label className="md:col-span-2 flex items-center gap-2 rounded-xl border border-line bg-surface-elevated px-3 py-2 text-sm text-ink">
              <input type="checkbox" name="isReminderOn" defaultChecked />
              <Bell className="h-3.5 w-3.5 text-primary-action" />
              {t("formLabels.reminder")}
            </label>
            <SubmitButton variant="primary" className="md:col-span-2">
              {t("saveCta")}
            </SubmitButton>
          </form>
        </Card>

        <Card variant="surface" className="space-y-4">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary-action" />
              <h2 className="section-title">{t("upcomingHeading")}</h2>
            </div>
            <Chip variant="primary" size="sm">
              {upcoming.length}
            </Chip>
          </header>
          {upcoming.length ? (
            <div className="grid gap-3">
              {upcoming.map((event) => (
                <article
                  key={event.id}
                  className="rounded-xl border border-line bg-surface-elevated p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-lg font-semibold text-ink">
                          {event.title}
                        </h3>
                        {event.isReminderOn ? (
                          <Chip variant="success" size="sm">
                            <Bell className="h-3 w-3" />
                            {t("reminderOn")}
                          </Chip>
                        ) : null}
                      </div>
                      {event.description ? (
                        <p className="mt-2 text-sm text-ink-muted">{event.description}</p>
                      ) : null}
                      <p className="mt-2 text-xs text-ink-subtle">
                        {event.startsAt.toLocaleString("en-ZA")}
                        {event.endsAt
                          ? ` → ${event.endsAt.toLocaleString("en-ZA")}`
                          : ""}
                      </p>
                      {event.location ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-subtle">
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <form
                    action={updateEventAction}
                    className="mt-4 grid gap-3 md:grid-cols-2"
                  >
                    <CsrfField />
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="eventId" value={event.id} />
                    <Input
                      name="title"
                      label={t("formLabels.title")}
                      defaultValue={event.title}
                      required
                      className="md:col-span-2"
                    />
                    <Textarea
                      name="description"
                      label={t("formLabels.description")}
                      rows={2}
                      defaultValue={event.description ?? ""}
                      className="md:col-span-2"
                    />
                    <Input
                      name="startsAt"
                      label={t("formLabels.startsAt")}
                      type="datetime-local"
                      defaultValue={toInputDateTime(event.startsAt)}
                      required
                    />
                    <Input
                      name="endsAt"
                      label={t("formLabels.endsAt")}
                      type="datetime-local"
                      defaultValue={event.endsAt ? toInputDateTime(event.endsAt) : ""}
                    />
                    <Input
                      name="location"
                      label={t("formLabels.location")}
                      defaultValue={event.location ?? ""}
                      className="md:col-span-2"
                    />
                    <label className="md:col-span-2 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        name="isReminderOn"
                        defaultChecked={event.isReminderOn}
                      />
                      <Bell className="h-3.5 w-3.5 text-primary-action" />
                      {t("formLabels.reminder")}
                    </label>
                    <SubmitButton variant="secondary" className="md:col-span-2">
                      {t("saveCta")}
                    </SubmitButton>
                  </form>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={deleteEventAction}>
                      <CsrfField />
                      <input type="hidden" name="businessId" value={business.id} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <SubmitButton variant="danger" size="sm">
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("deleteCta")}
                      </SubmitButton>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{t("emptyUpcoming")}</p>
          )}
        </Card>

        <Card variant="outline" className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="section-title">{t("pastHeading")}</h2>
            <Chip variant="primary" size="sm">
              {past.length}
            </Chip>
          </header>
          {past.length ? (
            <ul className="grid gap-2">
              {past.slice(0, 12).map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-elevated px-3 py-3"
                >
                  <div>
                    <p className="font-medium text-ink">{event.title}</p>
                    <p className="text-xs text-ink-subtle">
                      {event.startsAt.toLocaleDateString("en-ZA", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                      })}
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                  </div>
                  <form action={deleteEventAction}>
                    <CsrfField />
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="eventId" value={event.id} />
                    <SubmitButton variant="ghost" size="sm">
                      <Trash2 className="h-3.5 w-3.5" />
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">{t("emptyPast")}</p>
          )}
        </Card>
      </div>
    </main>
  );
}
