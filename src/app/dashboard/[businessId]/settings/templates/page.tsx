import { redirect } from "next/navigation";
import { MessageSquare, Plus, ExternalLink, AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import {
  listWhatsAppMessageTemplates,
  type WhatsAppMessageTemplate
} from "@/lib/whatsapp";

// Heita's platform-owned automated templates, with human descriptions. Live
// approval status is fetched from Meta and merged in by name below.
const HEITA_TEMPLATES = [
  {
    name: "heita_join_invite",
    description:
      "Sent when a known user messages your business WhatsApp number but hasn't joined your loyalty programme yet."
  },
  {
    name: "heita_event_reminder",
    description:
      "Reminds opted-in members about an upcoming event before it starts."
  },
  {
    name: "heita_promotion",
    description: "Broadcasts a promotion to opted-in, consented members."
  },
  {
    name: "heita_points_earned",
    description: "Notifies a customer when they earn loyalty points from a purchase."
  },
  {
    name: "heita_reward_redeemed",
    description: "Confirms a reward redemption."
  }
] as const;

const KNOWN_DESCRIPTIONS = new Map<string, string>(
  HEITA_TEMPLATES.map((template) => [template.name, template.description])
);

// Synthetic status for templates Heita expects but that don't yet exist in Meta.
const NOT_CREATED = "NOT_CREATED";

function statusChipVariant(
  status: string
): "success" | "warning" | "danger" | "default" {
  switch (status) {
    case "APPROVED":
      return "success";
    case "PENDING":
    case "IN_APPEAL":
    case "PENDING_DELETION":
      return "warning";
    case "REJECTED":
    case "DISABLED":
    case "PAUSED":
      return "danger";
    default:
      return "default";
  }
}

function statusLabel(status: string): string {
  if (status === NOT_CREATED) return "Not submitted";
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type DisplayTemplate = {
  name: string;
  description: string | null;
  status: string;
  category: string | null;
  language: string | null;
};

/**
 * Merge Heita's expected templates (always shown, with descriptions) with the
 * live list from Meta. Expected templates missing from Meta show NOT_CREATED;
 * any extra custom templates on the WABA are appended.
 */
function mergeTemplates(live: WhatsAppMessageTemplate[]): DisplayTemplate[] {
  const liveByName = new Map(live.map((template) => [template.name, template]));

  const expected: DisplayTemplate[] = HEITA_TEMPLATES.map((template) => {
    const match = liveByName.get(template.name);
    return {
      name: template.name,
      description: template.description,
      status: match?.status ?? NOT_CREATED,
      category: match?.category ?? null,
      language: match?.language ?? null
    };
  });

  const extra: DisplayTemplate[] = live
    .filter((template) => !KNOWN_DESCRIPTIONS.has(template.name))
    .map((template) => ({
      name: template.name,
      description: null,
      status: template.status,
      category: template.category,
      language: template.language
    }));

  return [...expected, ...extra];
}

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

  let live: WhatsAppMessageTemplate[] | null = null;
  let loadError = false;
  try {
    live = await listWhatsAppMessageTemplates();
  } catch (error) {
    logger.error({ err: error, businessId }, "whatsapp.templates.list_failed");
    loadError = true;
  }

  const configured = live !== null;
  const templates: DisplayTemplate[] = configured
    ? mergeTemplates(live ?? [])
    : HEITA_TEMPLATES.map((template) => ({
        name: template.name,
        description: template.description,
        status: NOT_CREATED,
        category: null,
        language: null
      }));

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
          Approval status is read live from Meta. Templates must be approved
          before they can be sent.
        </p>
      </Card>

      {loadError ? (
        <Card variant="outline" className="mt-6 border-warning/30 bg-warning/5">
          <div className="flex items-start gap-3 px-1 py-1 text-sm text-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>
              Couldn&apos;t reach Meta to load live template status. Showing the
              templates Heita uses; try again shortly.
            </p>
          </div>
        </Card>
      ) : !configured ? (
        <Card variant="outline" className="mt-6 border-warning/30 bg-warning/5">
          <div className="flex items-start gap-3 px-1 py-1 text-sm text-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>
              WhatsApp isn&apos;t fully configured, so live status is
              unavailable. Set the platform WhatsApp credentials to see real
              approval status.
            </p>
          </div>
        </Card>
      ) : null}

      <section className="mt-6 space-y-4">
        {templates.map((template) => (
          <Card key={template.name} variant="surface">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <h2 className="text-base font-mono font-semibold text-ink">
                  {template.name}
                </h2>
                {template.description ? (
                  <p className="text-sm leading-6 text-ink-muted max-w-prose">
                    {template.description}
                  </p>
                ) : null}
              </div>
              <Chip variant={statusChipVariant(template.status)} size="sm">
                {statusLabel(template.status)}
              </Chip>
            </div>

            {template.category || template.language ? (
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
                {template.category ? (
                  <span>
                    <span className="font-medium text-ink">Category:</span>{" "}
                    {template.category}
                  </span>
                ) : null}
                {template.language ? (
                  <span>
                    <span className="font-medium text-ink">Language:</span>{" "}
                    {template.language}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex items-center gap-2">
              <a
                href="https://business.facebook.com/latest/whatsapp_manager/templates"
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
            the Meta Business Suite. Once approved, they appear here with live
            status.
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
