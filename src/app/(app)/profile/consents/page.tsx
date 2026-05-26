import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { RevokeConsentButton } from "@/components/account/revoke-consent-button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { readCsrfCookie } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Privacy Consents" };
export const dynamic = "force-dynamic";

const CONSENT_LABELS: Record<string, string> = {
  TERMS_OF_SERVICE: "Terms of Service",
  PRIVACY_POLICY: "Privacy Policy",
  COOKIE_PREFERENCES: "Cookie Preferences",
  WHATSAPP_MARKETING: "WhatsApp Marketing"
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export default async function ConsentsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/profile/consents");
  }

  const userId = session.user.id;

  const [consents, csrfToken] = await Promise.all([
    prisma.userConsent.findMany({
      where: { userId },
      include: { business: { select: { id: true, name: true } } },
      orderBy: { grantedAt: "desc" }
    }),
    readCsrfCookie()
  ]);

  return (
    <section className="grid gap-5">
      <Card variant="hero" className="flex items-center gap-4 px-6 py-7 sm:px-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
            Privacy
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold">My Consents</h1>
          <p className="mt-1 text-sm text-white/70">
            Manage how your data is used across Heita.
          </p>
        </div>
      </Card>

      <Card variant="surface" className="space-y-4">
        <CardHeader
          title="Consent records"
          description="These are the privacy consents associated with your account. You may revoke active consents at any time."
        />

        {consents.length === 0 ? (
          <p className="text-sm text-ink-muted">No consent records found.</p>
        ) : (
          <ul className="grid gap-3">
            {consents.map((consent) => {
              const isActive = consent.revokedAt === null;
              const label = CONSENT_LABELS[consent.type] ?? consent.type;
              const scope = consent.business
                ? consent.business.name
                : "Global";

              return (
                <li
                  key={consent.id}
                  className="flex flex-col gap-3 rounded-xl border border-line bg-surface-elevated px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{label}</p>
                      <Chip
                        variant={isActive ? "success" : "default"}
                        size="sm"
                      >
                        {isActive ? "Active" : "Revoked"}
                      </Chip>
                    </div>
                    <p className="text-xs text-ink-subtle">
                      Scope: {scope}
                    </p>
                    <p className="text-xs text-ink-subtle">
                      Granted: {formatDate(consent.grantedAt)}
                    </p>
                    {consent.revokedAt ? (
                      <p className="text-xs text-ink-subtle">
                        Revoked: {formatDate(consent.revokedAt)}
                      </p>
                    ) : null}
                  </div>

                  {isActive ? (
                    <div className="shrink-0">
                      <RevokeConsentButton
                        consentId={consent.id}
                        csrfToken={csrfToken}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
