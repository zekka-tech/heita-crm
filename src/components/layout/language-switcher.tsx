"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { useCsrfToken } from "@/hooks/use-csrf-token";
import { localeLabels, locales, type Locale } from "@/i18n/config";
import { appendCsrfHeader } from "@/lib/csrf";

export function LanguageSwitcher({
  className,
  serverToken
}: {
  className?: string;
  serverToken?: string | null;
}) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const t = useTranslations("languageSwitcher");
  const csrfToken = useCsrfToken(serverToken);
  const [isSwitching, startTransition] = useTransition();

  const onChange = (next: Locale) => {
    if (next === locale) return;

    startTransition(async () => {
      await fetch("/api/locale", {
        method: "POST",
        headers: appendCsrfHeader({ "Content-Type": "application/json" }, csrfToken),
        body: JSON.stringify({ locale: next })
      });
      router.refresh();
    });
  };

  return (
    <label className={className ?? "inline-flex items-center gap-2 text-xs"}>
      <span className="sr-only">{t("label")}</span>
      <span aria-hidden="true" className="font-display text-[0.6875rem] uppercase tracking-widest text-ink-subtle">
        {t("shortcut")}
      </span>
      <select
        value={locale}
        onChange={(event) => onChange(event.target.value as Locale)}
        disabled={isSwitching || !csrfToken}
        className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink shadow-sm focus:border-primary focus:outline-none"
        aria-label={t("label")}
      >
        {locales.map((value) => (
          <option key={value} value={value}>
            {localeLabels[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
