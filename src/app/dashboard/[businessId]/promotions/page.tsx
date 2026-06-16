import { PromotionType, StaffRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Megaphone, Sparkles, Tag } from "lucide-react";

import {
  broadcastPromotionAction,
  createPromotionAction,
  updatePromotionAction
} from "@/app/dashboard/[businessId]/promotions/actions";
import { AiSuggestButton } from "@/app/dashboard/[businessId]/promotions/ai-suggest-button";
import { AiAdCopyPanel } from "@/app/dashboard/[businessId]/promotions/ai-ad-copy-panel";
import { DeletePromotionButton } from "@/app/dashboard/[businessId]/promotions/delete-promotion-button";
import { CsrfField } from "@/components/security/csrf-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { Input, Select, Textarea } from "@/components/ui/input";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";

export const dynamic = "force-dynamic";

type PromotionsDashboardPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ updated?: string }>;
};

function toInputDateTime(value: Date): string {
  const iso = value.toISOString();
  return iso.slice(0, 16);
}

function describePromotionType(type: PromotionType): string {
  switch (type) {
    case PromotionType.FLASH_SALE:
      return "Flash sale";
    case PromotionType.DISCOUNT:
      return "Discount";
    case PromotionType.BONUS_POINTS:
      return "Bonus points";
    case PromotionType.EVENT:
      return "Event";
  }
}

export default async function PromotionsDashboardPage({
  params,
  searchParams
}: PromotionsDashboardPageProps) {
  const { businessId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const session = await auth();
  const t = await getTranslations("promotions");

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/promotions`);
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
    include: {
      promotions: { orderBy: { startsAt: "desc" } },
      loyaltyTiers: { orderBy: { minPoints: "asc" } }
    }
  });

  if (!business) notFound();

  const now = new Date();
  const defaultStartsAt = toInputDateTime(now);
  const defaultEndsAt = toInputDateTime(
    new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
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
            {resolvedSearchParams.updated === "broadcast"
              ? t("broadcastSuccess")
              : null}
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
          <form action={createPromotionAction} className="grid gap-3 md:grid-cols-2">
            <CsrfField />
            <input type="hidden" name="businessId" value={business.id} />
            <Input
              name="title"
              label={t("formLabels.title")}
              placeholder="Friday flash sale"
              required
              className="md:col-span-2"
            />
            <Textarea
              name="description"
              label={t("formLabels.description")}
              rows={3}
              placeholder="Tell customers what to expect."
              className="md:col-span-2"
            />
            <Select name="type" label={t("formLabels.type")} defaultValue={PromotionType.DISCOUNT}>
              {Object.values(PromotionType).map((type) => (
                <option key={type} value={type}>
                  {describePromotionType(type)}
                </option>
              ))}
            </Select>
            <Input
              name="code"
              label={t("formLabels.code")}
              placeholder="WINTER25"
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
              required
            />
            <Input
              name="imageUrl"
              label={t("formLabels.imageUrl")}
              placeholder="https://..."
              type="url"
              className="md:col-span-2"
            />
            <div className="md:col-span-2">
              <p className="text-sm font-medium text-ink">{t("formLabels.tierTargets")}</p>
              <p className="mt-1 text-xs text-ink-subtle">{t("tierTargetsHint")}</p>
              <div className="mt-2 flex flex-wrap gap-3">
                {business.loyaltyTiers.length ? (
                  business.loyaltyTiers.map((tier) => (
                    <label
                      key={tier.id}
                      className="flex items-center gap-2 rounded-xl border border-line bg-surface-elevated px-3 py-2 text-sm text-ink"
                    >
                      <input type="checkbox" name="targetTierIds" value={tier.id} />
                      {tier.name}
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-ink-muted">{t("noTiers")}</p>
                )}
              </div>
            </div>
            <SubmitButton variant="primary" className="md:col-span-2">
              {t("saveCta")}
            </SubmitButton>
          </form>
        </Card>

        <Card variant="outline" className="space-y-3 p-5">
          <AiSuggestButton businessId={business.id} />
        </Card>

        <AiAdCopyPanel businessId={business.id} />

        <Card variant="outline" className="space-y-2 border-warning/40 bg-warning/5">
          <header className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-warning" />
            <h2 className="section-title">{t("broadcastCta")}</h2>
          </header>
          <p className="text-sm text-ink-muted">{t("broadcastDescription")}</p>
        </Card>

        <Card variant="surface" className="space-y-4">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary-action" />
              <h2 className="section-title">{t("listTitle")}</h2>
            </div>
            <Chip variant="primary" size="sm">
              {business.promotions.length}
            </Chip>
          </header>
          {business.promotions.length ? (
            <div className="grid gap-3">
              {business.promotions.map((promotion) => {
                const canBroadcast =
                  promotion.isActive &&
                  promotion.startsAt.getTime() <= now.getTime() &&
                  promotion.endsAt.getTime() > now.getTime() &&
                  !promotion.broadcastAt;
                const targetTierNames = promotion.targetTierIds
                  .map(
                    (tierId) =>
                      business.loyaltyTiers.find((tier) => tier.id === tierId)?.name ??
                      null
                  )
                  .filter((value): value is string => Boolean(value));

                return (
                  <article
                    key={promotion.id}
                    className="rounded-xl border border-line bg-surface-elevated p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-lg font-semibold text-ink">
                            {promotion.title}
                          </h3>
                          <Chip variant="primary" size="sm">
                            {describePromotionType(promotion.type)}
                          </Chip>
                          {!promotion.isActive ? (
                            <Chip variant="warning" size="sm">
                              Archived
                            </Chip>
                          ) : null}
                          {promotion.broadcastAt ? (
                            <Chip variant="success" size="sm">
                              Broadcast {promotion.broadcastAt.toLocaleDateString("en-ZA")}
                            </Chip>
                          ) : null}
                        </div>
                        {promotion.description ? (
                          <p className="mt-2 text-sm text-ink-muted">
                            {promotion.description}
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs text-ink-subtle">
                          {promotion.startsAt.toLocaleString("en-ZA")} →{" "}
                          {promotion.endsAt.toLocaleString("en-ZA")}
                        </p>
                        {promotion.code ? (
                          <p className="mt-1 text-xs text-ink-subtle">
                            Code: <span className="font-mono">{promotion.code}</span>
                          </p>
                        ) : null}
                        {targetTierNames.length ? (
                          <p className="mt-1 text-xs text-ink-subtle">
                            Targets: {targetTierNames.join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <form
                      action={updatePromotionAction}
                      className="mt-4 grid gap-3 md:grid-cols-2"
                    >
                      <CsrfField />
                      <input type="hidden" name="businessId" value={business.id} />
                      <input type="hidden" name="promotionId" value={promotion.id} />
                      <Input
                        name="title"
                        label={t("formLabels.title")}
                        defaultValue={promotion.title}
                        required
                        className="md:col-span-2"
                      />
                      <Textarea
                        name="description"
                        label={t("formLabels.description")}
                        rows={2}
                        defaultValue={promotion.description ?? ""}
                        className="md:col-span-2"
                      />
                      <Select
                        name="type"
                        label={t("formLabels.type")}
                        defaultValue={promotion.type}
                      >
                        {Object.values(PromotionType).map((type) => (
                          <option key={type} value={type}>
                            {describePromotionType(type)}
                          </option>
                        ))}
                      </Select>
                      <Input
                        name="code"
                        label={t("formLabels.code")}
                        defaultValue={promotion.code ?? ""}
                      />
                      <Input
                        name="startsAt"
                        label={t("formLabels.startsAt")}
                        type="datetime-local"
                        defaultValue={toInputDateTime(promotion.startsAt)}
                        required
                      />
                      <Input
                        name="endsAt"
                        label={t("formLabels.endsAt")}
                        type="datetime-local"
                        defaultValue={toInputDateTime(promotion.endsAt)}
                        required
                      />
                      <Input
                        name="imageUrl"
                        label={t("formLabels.imageUrl")}
                        type="url"
                        defaultValue={promotion.imageUrl ?? ""}
                        className="md:col-span-2"
                      />
                      <div className="md:col-span-2 flex flex-wrap gap-3">
                        {business.loyaltyTiers.map((tier) => (
                          <label
                            key={tier.id}
                            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
                          >
                            <input
                              type="checkbox"
                              name="targetTierIds"
                              value={tier.id}
                              defaultChecked={promotion.targetTierIds.includes(tier.id)}
                            />
                            {tier.name}
                          </label>
                        ))}
                      </div>
                      <SubmitButton variant="secondary" className="md:col-span-2">
                        {t("saveCta")}
                      </SubmitButton>
                    </form>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canBroadcast ? (
                        <form action={broadcastPromotionAction}>
                          <CsrfField />
                          <input type="hidden" name="businessId" value={business.id} />
                          <input type="hidden" name="promotionId" value={promotion.id} />
                          <SubmitButton variant="primary" size="sm">
                            <Megaphone className="h-3.5 w-3.5" />
                            {t("broadcastCta")}
                          </SubmitButton>
                        </form>
                      ) : null}
                      <DeletePromotionButton
                        businessId={business.id}
                        promotionId={promotion.id}
                        label={t("deleteCta")}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{t("emptyState")}</p>
          )}
        </Card>
      </div>
    </main>
  );
}
