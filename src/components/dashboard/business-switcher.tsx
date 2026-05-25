"use client";

import type { Route } from "next";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2 } from "lucide-react";

type BusinessSwitcherProps = {
  currentBusinessId: string;
  businesses: Array<{
    id: string;
    name: string;
    role: string;
  }>;
};

export function BusinessSwitcher({
  currentBusinessId,
  businesses
}: BusinessSwitcherProps) {
  const t = useTranslations("businessSwitcher");
  const router = useRouter();
  const pathname = usePathname();

  if (businesses.length <= 1) {
    return null;
  }

  const handleChange = (nextBusinessId: string) => {
    if (nextBusinessId === currentBusinessId) return;

    const nextPath = pathname?.startsWith(`/dashboard/${currentBusinessId}`)
      ? pathname.replace(
          `/dashboard/${currentBusinessId}`,
          `/dashboard/${nextBusinessId}`
        )
      : `/dashboard/${nextBusinessId}`;

    router.push(nextPath as Route);
  };

  return (
    <label className="inline-flex items-center gap-2 rounded-2xl border border-line bg-surface-elevated px-3 py-2">
      <Building2 className="h-4 w-4 text-primary-action" aria-hidden="true" />
      <span className="sr-only">{t("label")}</span>
      <select
        aria-label={t("label")}
        className="bg-transparent text-sm font-medium text-ink focus:outline-none"
        value={currentBusinessId}
        onChange={(event) => handleChange(event.target.value)}
      >
        {businesses.map((business) => (
          <option key={business.id} value={business.id}>
            {business.name} · {business.role}
          </option>
        ))}
      </select>
    </label>
  );
}
