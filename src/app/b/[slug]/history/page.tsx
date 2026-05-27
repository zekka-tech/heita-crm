import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Receipt, Download } from "lucide-react";
import { TransactionType } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { isBuildPhase } from "@/lib/build-phase";

export const dynamic = "force-dynamic";

type BusinessReceiptHistoryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    type?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function BusinessReceiptHistoryPage({
  params,
  searchParams
}: BusinessReceiptHistoryPageProps) {
  const { slug } = await params;

  if (isBuildPhase()) {
    return <main className="px-4 pb-24 pt-6 sm:px-8" />;
  }

  const [{ auth }, { resolveLocale }, { getReceiptHistory }] = await Promise.all([
    import("@/lib/auth"),
    import("@/i18n/locale"),
    import("@/server/services/receipt-history.service")
  ]);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const session = await auth();
  const locale = await resolveLocale();
  const t = await getTranslations("receiptHistory");

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/b/${slug}/history`);
  }

  const type =
    resolvedSearchParams.type &&
    Object.values(TransactionType).includes(
      resolvedSearchParams.type as TransactionType
    )
      ? (resolvedSearchParams.type as TransactionType)
      : "ALL";

  const history = await getReceiptHistory({
    businessSlug: slug,
    userId: session.user.id,
    type,
    dateFrom: resolvedSearchParams.from ? new Date(resolvedSearchParams.from) : null,
    dateTo: resolvedSearchParams.to ? new Date(resolvedSearchParams.to) : null
  }).catch(() => null);

  if (!history) {
    redirect(`/b/${slug}`);
  }

  const exportUrl = `/api/account/receipt-history?businessSlug=${encodeURIComponent(
    slug
  )}&type=${encodeURIComponent(type)}`;

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <div className="grid gap-5">
        <Card variant="hero" className="px-6 py-8 sm:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
            {history.membership.business.name} · {t("eyebrow")}
          </p>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-2 text-white/85">{t("subtitle")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <a href={exportUrl}>
                <Download className="h-4 w-4" />
                {t("exportCsv")}
              </a>
            </Button>
          </div>
        </Card>

        <Card variant="surface" className="space-y-4">
          <form className="grid gap-3 md:grid-cols-4">
            <input type="hidden" name="slug" value={slug} />
            <label className="label-stack">
              <span className="label">{t("filters.type")}</span>
              <select name="type" defaultValue={type} className="input">
                <option value="ALL">{t("filters.all")}</option>
                {Object.values(TransactionType).map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
            <label className="label-stack">
              <span className="label">{t("filters.from")}</span>
              <input
                className="input"
                type="date"
                name="from"
                defaultValue={resolvedSearchParams.from ?? ""}
              />
            </label>
            <label className="label-stack">
              <span className="label">{t("filters.to")}</span>
              <input
                className="input"
                type="date"
                name="to"
                defaultValue={resolvedSearchParams.to ?? ""}
              />
            </label>
            <div className="flex items-end">
              <Button type="submit" variant="primary" size="sm">
                {t("filters.apply")}
              </Button>
            </div>
          </form>

          {history.transactions.length ? (
            <ul className="grid gap-2">
              {history.transactions.map((transaction) => (
                <li
                  key={transaction.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-elevated px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-ink">
                      {transaction.description ?? transaction.type}
                    </p>
                    <p className="text-xs text-ink-subtle">
                      {transaction.createdAt.toLocaleDateString(locale, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                      })}
                    </p>
                  </div>
                  <Chip
                    variant={transaction.pointsDelta >= 0 ? "success" : "warning"}
                    size="sm"
                  >
                    {transaction.pointsDelta >= 0 ? "+" : ""}
                    {transaction.pointsDelta}
                  </Chip>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center text-ink-muted">
              <Receipt className="mx-auto h-7 w-7" />
              <p className="mt-3">{t("empty")}</p>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
