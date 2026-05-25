"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCsrfToken } from "@/hooks/use-csrf-token";
import { appendCsrfHeader } from "@/lib/csrf";
import {
  defaultBusinessNotificationPreference,
  getBusinessNotificationPreference,
  normalizeNotificationPreferences,
  type NotificationPreferences
} from "@/lib/notification-preferences";

type BusinessOption = {
  id: string;
  name: string;
};

type NotificationPreferencesCardProps = {
  businesses: BusinessOption[];
  initialPreferences: NotificationPreferences;
};

function mergePreferenceState(
  current: NotificationPreferences,
  businessId: string,
  patch: Partial<NotificationPreferences["businesses"][string]>
) {
  const nextPreference = {
    ...defaultBusinessNotificationPreference(),
    ...(current.businesses[businessId] ?? {}),
    ...patch
  };

  return normalizeNotificationPreferences({
    ...current,
    businesses: {
      ...current.businesses,
      [businessId]: nextPreference
    }
  });
}

export function NotificationPreferencesCard({
  businesses,
  initialPreferences
}: NotificationPreferencesCardProps) {
  const t = useTranslations("notificationPreferences");
  const csrfToken = useCsrfToken();
  const [preferences, setPreferences] = useState(() =>
    normalizeNotificationPreferences(initialPreferences)
  );
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const businessEntries = useMemo(
    () =>
      businesses.map((business) => ({
        ...business,
        preference: getBusinessNotificationPreference(preferences, business.id)
      })),
    [businesses, preferences]
  );

  const updatePreference = (
    businessId: string,
    recipe: (
      current: ReturnType<typeof defaultBusinessNotificationPreference>
    ) => ReturnType<typeof defaultBusinessNotificationPreference>
  ) => {
    setPreferences((current) => {
      const nextPreference = recipe(
        getBusinessNotificationPreference(current, businessId)
      );

      return mergePreferenceState(current, businessId, nextPreference);
    });
  };

  const save = () => {
    startTransition(async () => {
      setStatus(null);

      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: appendCsrfHeader(
          {
            "Content-Type": "application/json"
          },
          csrfToken
        ),
        body: JSON.stringify({
          notificationPreferences: preferences
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            user?: {
              notificationPreferences?: NotificationPreferences | null;
            };
          }
        | null;
      if (response.ok) {
        setPreferences(
          normalizeNotificationPreferences(payload?.user?.notificationPreferences ?? preferences)
        );
      }
      setStatus(response.ok ? t("updated") : payload?.error ?? t("updateError"));
    });
  };

  return (
    <Card variant="surface" className="space-y-4">
      <div className="space-y-2">
        <h2 className="section-title">{t("title")}</h2>
        <p className="text-sm text-ink-muted">{t("description")}</p>
      </div>

      {businessEntries.length ? (
        <div className="space-y-4">
          {businessEntries.map(({ id, name, preference }) => (
            <section
              key={id}
              className="space-y-4 rounded-2xl border border-line bg-surface-elevated px-4 py-4"
            >
              <div className="space-y-1">
                <h3 className="font-display text-base font-semibold text-ink">{name}</h3>
                <p className="text-xs text-ink-subtle">{t("businessHint")}</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {(["inApp", "push", "email"] as const).map((channel) => (
                  <label
                    key={channel}
                    className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-3 text-sm text-ink"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-primary-action)]"
                      checked={preference.channels[channel]}
                      onChange={(event) =>
                        updatePreference(id, (current) => ({
                          ...current,
                          channels: {
                            ...current.channels,
                            [channel]: event.target.checked
                          }
                        }))
                      }
                    />
                    <span>{t(`channels.${channel}`)}</span>
                  </label>
                ))}
              </div>

              <div className="space-y-3 rounded-xl border border-dashed border-line px-3 py-3">
                <label className="flex items-center gap-3 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--color-primary-action)]"
                    checked={preference.quietHours.enabled}
                    onChange={(event) =>
                      updatePreference(id, (current) => ({
                        ...current,
                        quietHours: {
                          ...current.quietHours,
                          enabled: event.target.checked
                        }
                      }))
                    }
                  />
                  <span>{t("quietHours.enabled")}</span>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label={t("quietHours.start")}
                    type="time"
                    value={preference.quietHours.start}
                    disabled={!preference.quietHours.enabled}
                    onChange={(event) =>
                      updatePreference(id, (current) => ({
                        ...current,
                        quietHours: {
                          ...current.quietHours,
                          start: event.target.value || current.quietHours.start
                        }
                      }))
                    }
                  />
                  <Input
                    label={t("quietHours.end")}
                    type="time"
                    value={preference.quietHours.end}
                    disabled={!preference.quietHours.enabled}
                    onChange={(event) =>
                      updatePreference(id, (current) => ({
                        ...current,
                        quietHours: {
                          ...current.quietHours,
                          end: event.target.value || current.quietHours.end
                        }
                      }))
                    }
                  />
                </div>

                <p className="text-xs text-ink-subtle">
                  {t("quietHours.timezone", {
                    timezone: preference.quietHours.timezone
                  })}
                </p>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{t("emptyState")}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          onClick={save}
          disabled={isPending || !csrfToken || businessEntries.length === 0}
        >
          {t("saveChanges")}
        </Button>
        {status ? (
          <p className="text-sm text-ink-muted" role="status" aria-live="polite">
            {status}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
