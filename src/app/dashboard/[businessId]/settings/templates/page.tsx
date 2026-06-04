import { redirect } from "next/navigation";
import { MessageSquare, Plus, ExternalLink } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const BUILT_IN_TEMPLATES = [
  {
    name: "heita_join_invite",
    description:
      "Sent when a known user messages your business WhatsApp number but hasn't joined your loyalty programme yet.",
    category: "UTILITY",
    language: "en_ZA",
    status: "Approved",
    variables: ["business_name", "join_link"]
  },
  {
    name: "heita_points_earned",
    description:
      "Notifies a customer when they earn loyalty points from a purchase.",
    category: "UTILITY",
    language: "en_ZA",
    status: "Pending",
    variables: ["customer_name", "points_earned", "total_points"]
  },
  {
    name: "heita_reward_redeemed",
    description: "Confirms a reward redemption.",
    category: "UTILITY",
    language: "en_ZA",
    status: "Draft",
    variables: ["customer_name", "reward_name", "points_spent"]
  }
] as const;

const STATUS_CHIP_VARIANT: Record<string, "success" | "warning" | "default"> = {
  Approved: "success",
  Pending: "warning",
  Draft: "default"
};

type TemplatesSettingsPageProps = {
  params: Promise<{ businessId: string }>;
};

export default async function TemplatesSettingsPage({
  params
}: TemplatesSettingsPageProps) {
  const { businessId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/templates`);
  }

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <Card variant="hero" className="px-6 py-7 sm:px-10">
        <Chip variant="primary" className="bg-white/15 text-white border-white/20">
          <MessageSquare className="h-3.5 w-3.5" />
          WhatsApp Templates
        </Chip>
        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Message templates
        </h1>
        <p className="mt-2 max-w-2xl text-white/85">
          Manage message templates for automated WhatsApp communications.
          Templates must be approved by Meta before they can be sent.
        </p>
      </Card>

      <section className="mt-6 space-y-4">
        {BUILT_IN_TEMPLATES.map((template) => (
          <Card key={template.name} variant="surface">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <h2 className="text-base font-mono font-semibold text-ink">
                  {template.name}
                </h2>
                <p className="text-sm leading-6 text-ink-muted max-w-prose">
                  {template.description}
                </p>
              </div>
              <Chip
                variant={STATUS_CHIP_VARIANT[template.status] ?? "default"}
                size="sm"
              >
                {template.status}
              </Chip>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
              <span>
                <span className="font-medium text-ink">Category:</span>{" "}
                {template.category}
              </span>
              <span>
                <span className="font-medium text-ink">Language:</span>{" "}
                {template.language}
              </span>
              <span>
                <span className="font-medium text-ink">Variables:</span>{" "}
                <code className="text-xs">
                  {template.variables.map((v) => `{{${v}}}`).join(", ")}
                </code>
              </span>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <a
                href="https://business.facebook.com/latest/whatsapp_manager/templates?phone_number_id=&waba_id="
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex items-center gap-1 text-xs text-ink-muted",
                  "hover:text-primary-action transition-colors"
                )}
              >
                <ExternalLink className="h-3 w-3" />
                Manage in Meta Business Suite
              </a>
            </div>
          </Card>
        ))}
      </section>

      <Card variant="outline" className="mt-6 text-center">
        <div className="flex flex-col items-center py-8">
          <MessageSquare className="h-8 w-8 text-ink-muted mb-3" />
          <h3 className="text-lg font-semibold text-ink">
            Need a custom template?
          </h3>
          <p className="mt-1 max-w-md text-sm text-ink-muted">
            WhatsApp message templates are created and submitted for approval in
            the Meta Business Suite. Once approved, contact us to activate them
            for your business.
          </p>
          <a
            href="https://business.facebook.com/latest/whatsapp_manager/templates"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "mt-4 inline-flex items-center gap-1.5 text-sm font-medium",
              "text-primary-action hover:underline"
            )}
          >
            <Plus className="h-4 w-4" />
            Create in Meta Business Suite
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </Card>
    </main>
  );
}
