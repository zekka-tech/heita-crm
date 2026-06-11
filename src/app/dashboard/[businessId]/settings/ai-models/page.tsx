import type { Route } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CsrfField } from "@/components/security/csrf-field";
import { listProviders } from "@/lib/ai/providers/registry";
import { auth } from "@/lib/auth";
import {
  listProviderConnections,
  type AiProviderConnectionView
} from "@/server/services/ai-provider.service";

import {
  activateProviderConnectionAction,
  addProviderConnectionAction,
  deleteProviderConnectionAction,
  validateProviderConnectionAction
} from "./actions";

const UNVERIFIED_BADGE = {
  label: "Unverified",
  className: "text-ink-subtle border-line bg-muted"
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Verified", className: "text-eco-green border-eco-green/30 bg-eco-green/5" },
  UNVERIFIED: UNVERIFIED_BADGE,
  INVALID: { label: "Key invalid", className: "text-danger border-danger/30 bg-danger/5" },
  DISABLED: { label: "Disabled", className: "text-ink-subtle border-line bg-muted" }
};

const FLASH_MESSAGES: Record<string, string> = {
  saved: "Provider connection saved.",
  validated: "Connection verified — the key and model are working.",
  activated: "This model now powers your AI co-worker.",
  deactivated: "Reverted to the platform default AI.",
  removed: "Connection removed."
};

function ConnectionRow({
  businessId,
  connection
}: {
  businessId: string;
  connection: AiProviderConnectionView;
}) {
  const badge = STATUS_BADGE[connection.status] ?? UNVERIFIED_BADGE;

  return (
    <div className="space-y-2 rounded-lg border border-line bg-muted px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">
            {connection.label || connection.provider}
            {connection.isActive ? (
              <span className="ml-2 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs font-semibold text-primary-action">
                Active brain
              </span>
            ) : null}
          </p>
          <p className="text-muted-foreground">
            {connection.provider} · {connection.chatModel} · key ••••{connection.keyLast4}
            {connection.baseUrl ? ` · ${connection.baseUrl}` : ""}
          </p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {connection.lastError ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
          Last error: {connection.lastError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <form action={validateProviderConnectionAction}>
          <CsrfField />
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="connectionId" value={connection.id} />
          <Button type="submit" variant="secondary">Test key</Button>
        </form>
        {connection.isActive ? (
          <form action={activateProviderConnectionAction}>
            <CsrfField />
            <input type="hidden" name="businessId" value={businessId} />
            <input type="hidden" name="connectionId" value="" />
            <Button type="submit" variant="secondary">Use platform default</Button>
          </form>
        ) : (
          <form action={activateProviderConnectionAction}>
            <CsrfField />
            <input type="hidden" name="businessId" value={businessId} />
            <input type="hidden" name="connectionId" value={connection.id} />
            <Button type="submit" variant="primary">Make active</Button>
          </form>
        )}
        <form action={deleteProviderConnectionAction}>
          <CsrfField />
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="connectionId" value={connection.id} />
          <Button type="submit" variant="secondary">Remove</Button>
        </form>
      </div>
    </div>
  );
}

export default async function AiModelsSettingsPage({
  params,
  searchParams
}: {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ connection?: string; reason?: string }>;
}) {
  const { businessId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in" as Route);
  }

  let connections: AiProviderConnectionView[] = [];
  let accessError: string | null = null;
  try {
    connections = await listProviderConnections({
      businessId,
      userId: session.user.id
    });
  } catch (error) {
    accessError =
      error instanceof Error ? error.message : "You do not have access to AI model settings.";
  }

  const providers = listProviders();
  const flash = resolvedSearchParams.connection
    ? FLASH_MESSAGES[resolvedSearchParams.connection]
    : undefined;
  const activeConnection = connections.find((connection) => connection.isActive);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI model</h1>
        <p className="text-muted-foreground mt-1">
          Bring your own model: connect ChatGPT, Claude, Gemini, DeepSeek, MiniMax, Kimi, Qwen,
          or any OpenAI-compatible endpoint to power your AI co-worker with your own
          subscription. Your key is encrypted and never shown again after saving.
        </p>
      </div>

      {accessError ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {accessError}
        </p>
      ) : (
        <>
          {flash ? (
            <p className="rounded-lg border border-eco-green/30 bg-eco-green/5 px-3 py-2 text-sm text-eco-green">
              {flash}
            </p>
          ) : null}
          {resolvedSearchParams.connection === "error" ? (
            <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {resolvedSearchParams.reason ?? "Something went wrong."}
            </p>
          ) : null}

          <Card variant="surface">
            <CardHeader
              title="Current brain"
              description="The model that answers in your AI workspace and WhatsApp auto-replies. When your model fails or is removed, Heita falls back to the platform default automatically."
            />
            <div className="px-6 pb-6">
              <p className="text-sm text-muted-foreground">
                {activeConnection ? (
                  <>
                    <span className="font-medium text-eco-green">
                      {activeConnection.label || activeConnection.provider}
                    </span>{" "}
                    · {activeConnection.chatModel}
                  </>
                ) : (
                  <span className="text-ink-subtle">
                    Platform default (managed by Heita)
                  </span>
                )}
              </p>
            </div>
          </Card>

          <Card variant="surface">
            <CardHeader
              title="Connect a provider"
              description="Paste an API key from your provider account. We verify it with a one-token test request before it can be used."
            />
            <div className="px-6 pb-6">
              <form action={addProviderConnectionAction} className="grid gap-4 md:grid-cols-2">
                <CsrfField />
                <input type="hidden" name="businessId" value={businessId} />
                <label className="grid gap-1 text-sm font-medium text-ink">
                  Provider
                  <select
                    name="provider"
                    defaultValue="OPENAI"
                    className="rounded-xl border border-line bg-surface-elevated px-3 py-2 text-sm text-ink"
                  >
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  name="apiKey"
                  type="password"
                  label="API key"
                  hint="Stored encrypted. Only the last 4 characters stay visible."
                  placeholder="sk-..."
                  required
                  autoComplete="off"
                />
                <Input
                  name="chatModel"
                  label="Model"
                  hint="Leave blank to use the provider's recommended default."
                  placeholder="e.g. gpt-4o-mini, claude-haiku-4-5, deepseek-chat"
                  list="byok-model-suggestions"
                />
                <datalist id="byok-model-suggestions">
                  {providers.flatMap((provider) =>
                    provider.suggestedModels.map((model) => (
                      <option key={`${provider.id}-${model}`} value={model} />
                    ))
                  )}
                </datalist>
                <Input
                  name="label"
                  label="Label"
                  hint="Optional display name, e.g. 'Marketing GPT'."
                  placeholder="My model"
                />
                <Input
                  name="baseUrl"
                  label="Base URL"
                  hint="Custom (OpenAI-compatible) provider only — e.g. Mino, Opencode, Hermes Agent, OpenRouter, or a self-hosted gateway."
                  placeholder="https://api.example.com/v1"
                  inputMode="url"
                />
                <Button type="submit" variant="primary" className="md:col-span-2">
                  Save and verify connection
                </Button>
              </form>
            </div>
          </Card>

          <Card variant="surface">
            <CardHeader
              title="Your connections"
              description="Verify, switch, or remove connected models. Only Owners and Managers can manage these."
            />
            <div className="px-6 pb-6 space-y-3">
              {connections.map((connection) => (
                <ConnectionRow
                  key={connection.id}
                  businessId={businessId}
                  connection={connection}
                />
              ))}
              {!connections.length ? (
                <p className="rounded-lg border border-dashed border-line px-3 py-3 text-sm text-muted-foreground">
                  No provider connections yet. Your AI co-worker is running on the platform
                  default model.
                </p>
              ) : null}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
