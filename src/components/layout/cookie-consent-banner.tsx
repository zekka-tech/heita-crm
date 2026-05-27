"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  readCookieConsent,
  writeCookieConsent,
  type CookieConsentChoice
} from "@/lib/cookie-consent";

export function CookieConsentBanner() {
  const t = useTranslations("cookieConsent");
  const [consent, setConsent] = useState<CookieConsentChoice | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const stored = readCookieConsent();
    setConsent(stored);
    setIsReady(true);
  }, []);

  if (!isReady || consent !== null) {
    return null;
  }

  const handleChoice = (choice: CookieConsentChoice) => {
    writeCookieConsent(choice);
    setConsent(choice);
    // Fire-and-forget: persist the choice to the DB for authenticated users.
    // The localStorage state is the source of truth for the banner UI.
    void fetch("/api/account/consents/cookie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choice }),
      credentials: "same-origin"
    }).catch(() => undefined);
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 sm:bottom-4 sm:left-8 sm:right-8">
      <div className="surface-glass flex flex-col gap-3 rounded-3xl border border-line/80 px-4 py-4 shadow-xl backdrop-blur sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-2">
          <div className="flex items-center gap-2 text-ink">
            <ShieldCheck className="h-4 w-4 text-primary-action" />
            <p className="font-display text-sm font-semibold">{t("title")}</p>
          </div>
          <p className="text-sm leading-6 text-ink-muted">{t("body")}</p>
          <Link href="/cookies" className="text-sm font-medium text-primary-action underline">
            {t("learnMore")}
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleChoice("rejected")}
          >
            {t("reject")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => handleChoice("accepted")}
          >
            {t("accept")}
          </Button>
        </div>
      </div>
    </div>
  );
}
