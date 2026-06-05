import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/shared/copy-button";
import { CsrfField } from "@/components/security/csrf-field";
import { redirect } from "next/navigation";
import type { Route } from "next";

import { connectWhatsAppAction } from "./actions";

const maskSecret = (secret: string) =>
  secret.length > 10
    ? secret.slice(0, 6) + "\u2022".repeat(secret.length - 10) + secret.slice(-4)
    : "\u2022".repeat(secret.length);

export default async function IntegrationsSettingsPage({
  params,
  searchParams
}: {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ whatsapp?: string; reason?: string }>;
}) {
  const { businessId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const session = await auth();

  if (!session) {
    redirect("/sign-in");
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId, deletedAt: null },
    select: {
      name: true,
      slug: true,
      wabaPhoneId: true,
      whatsappPhoneNumber: true
    }
  });

  if (!business) {
    redirect("/dashboard" as Route);
  }

  const posSecret = process.env.POS_SHARED_SECRET ?? "";
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/integrations/transactions`;
  const whatsappConnected = Boolean(business.wabaPhoneId);
  const whatsappStatus = resolvedSearchParams.whatsapp;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect WhatsApp and your point-of-sale system to your loyalty programme.
        </p>
      </div>

      <Card variant="surface">
        <CardHeader
          title="WhatsApp Business number"
          description="Connect the WhatsApp number customers message and that sends reminders, promotions, and replies."
        />
        <div className="px-6 pb-6 space-y-4">
          {whatsappStatus === "saved" ? (
            <p className="rounded-lg border border-eco-green/30 bg-eco-green/5 px-3 py-2 text-sm text-eco-green">
              WhatsApp settings saved.
            </p>
          ) : null}
          {whatsappStatus === "error" ? (
            <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {resolvedSearchParams.reason ?? "Could not save WhatsApp settings."}
            </p>
          ) : null}

          <p className="text-sm text-muted-foreground">
            Status:{" "}
            <span
              className={
                whatsappConnected ? "font-medium text-eco-green" : "text-ink-subtle"
              }
            >
              {whatsappConnected ? "Connected" : "Not connected"}
            </span>
          </p>

          <form action={connectWhatsAppAction} className="space-y-4">
            <CsrfField />
            <input type="hidden" name="businessId" value={businessId} />
            <Input
              name="whatsappPhoneNumber"
              label="WhatsApp number (display)"
              hint="The number customers see, in international format, e.g. +27821234567."
              defaultValue={business.whatsappPhoneNumber ?? ""}
              placeholder="+27821234567"
              inputMode="tel"
            />
            <Input
              name="wabaPhoneId"
              label="WhatsApp phone number ID"
              hint="The numeric Phone Number ID from Meta WhatsApp Manager. Leave blank to disconnect."
              defaultValue={business.wabaPhoneId ?? ""}
              placeholder="123456789012345"
              inputMode="numeric"
            />
            <Button type="submit" variant="primary">
              Save WhatsApp settings
            </Button>
          </form>
        </div>
      </Card>

      <div>
        <h2 className="text-xl font-bold tracking-tight">POS Integration</h2>
        <p className="text-muted-foreground mt-1">
          Connect your point-of-sale system to automatically award loyalty points at checkout.
        </p>
      </div>

      <Card variant="surface">
        <CardHeader
          title="Webhook endpoint"
          description="Send POST requests to this URL from your POS system to award points."
        />
        <div className="px-6 pb-6">
          <div className="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2 font-mono text-sm">
            <span className="flex-1 truncate">{webhookUrl}</span>
            <CopyButton value={webhookUrl} />
          </div>
        </div>
      </Card>

      <Card variant="surface">
        <CardHeader
          title="API credentials"
          description="Use these values in your POS webhook configuration."
        />
        <div className="px-6 pb-6 space-y-4">
          <div>
            <label className="text-sm font-medium">Business ID</label>
            <div className="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2 font-mono text-sm mt-1">
              <span className="flex-1 truncate">{businessId}</span>
              <CopyButton value={businessId} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Business Slug</label>
            <div className="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2 font-mono text-sm mt-1">
              <span className="flex-1 truncate">{business.slug}</span>
              <CopyButton value={business.slug} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Shared Secret</label>
            <div className="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2 font-mono text-sm mt-1">
              <span className="flex-1 truncate">
                {posSecret ? maskSecret(posSecret) : "Not configured"}
              </span>
              {posSecret && <CopyButton value={posSecret} />}
            </div>
            {!posSecret && (
              <p className="text-xs text-destructive mt-1">
                POS_SHARED_SECRET environment variable is not set. Contact your administrator.
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card variant="surface">
        <CardHeader
          title="Request format"
          description="Your POS system should send a JSON payload with the following fields."
        />
        <div className="px-6 pb-6">
          <pre className="rounded-lg bg-muted p-4 text-sm overflow-x-auto">
{`POST /api/integrations/transactions
Content-Type: application/json
x-heita-signature: <HMAC-SHA256 of body with shared secret>

{
  "businessId": "${businessId}",
  "phone": "+27821234567",
  "points": 150,
  "description": "Purchase at till 3",
  "externalTransactionId": "pos-txn-789",
  "timestamp": "${new Date().toISOString()}"
}`}
          </pre>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">businessId</span> — Your business ID (or use &quot;businessSlug&quot;)</p>
            <p><span className="font-medium text-foreground">phone</span> — Customer phone number (E.164 format: +27821234567)</p>
            <p><span className="font-medium text-foreground">points</span> — Number of points to award (positive integer)</p>
            <p><span className="font-medium text-foreground">description</span> — Optional description of the transaction</p>
            <p><span className="font-medium text-foreground">externalTransactionId</span> — Unique ID from your POS for deduplication</p>
            <p><span className="font-medium text-foreground">timestamp</span> — ISO 8601 timestamp of the original transaction</p>
          </div>
        </div>
      </Card>

      <Card variant="outline">
        <CardHeader
          title="Rate limits"
          description="To ensure fair usage, POS endpoints are rate-limited."
        />
        <div className="px-6 pb-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium">Per business</p>
              <p className="text-muted-foreground">{process.env.POS_RATE_LIMIT_PER_BUSINESS_PER_MINUTE ?? "180"} requests/minute</p>
            </div>
            <div>
              <p className="font-medium">Per IP address</p>
              <p className="text-muted-foreground">{process.env.POS_RATE_LIMIT_PER_BUSINESS_IP_PER_MINUTE ?? "60"} requests/minute</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
