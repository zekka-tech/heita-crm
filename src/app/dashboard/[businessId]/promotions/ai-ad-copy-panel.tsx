"use client";

import { useCallback, useState } from "react";
import { Loader2, Megaphone, Copy, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { useCsrfToken } from "@/hooks/use-csrf-token";
import { appendCsrfHeader } from "@/lib/csrf";
import type { AdCopyChannel, AdCopyResult, AdCopyVariant } from "@/server/services/ai-ad.service";

const CHANNELS: { value: AdCopyChannel; label: string }[] = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "EMAIL", label: "Email" },
  { value: "IN_APP", label: "In-app" }
];

function VariantCard({ variant }: { variant: AdCopyVariant }) {
  const [copied, setCopied] = useState(false);
  const copyText = [variant.headline, variant.body, variant.cta].filter(Boolean).join("\n");

  const onCopy = useCallback(() => {
    navigator.clipboard?.writeText(copyText).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined
    );
  }, [copyText]);

  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        {variant.headline ? (
          <h3 className="font-display text-base font-semibold text-ink">{variant.headline}</h3>
        ) : (
          <span />
        )}
        <button
          onClick={onCopy}
          className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink"
          aria-label="Copy variant"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{variant.body}</p>
      {variant.cta ? (
        <Chip variant="primary" size="sm" className="mt-3">
          {variant.cta}
        </Chip>
      ) : null}
    </article>
  );
}

export function AiAdCopyPanel({ businessId }: { businessId: string }) {
  const csrfToken = useCsrfToken();
  const [offer, setOffer] = useState("");
  const [channel, setChannel] = useState<AdCopyChannel>("WHATSAPP");
  const [variants, setVariants] = useState<AdCopyVariant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!offer.trim()) {
      setError("Describe the offer or campaign first.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setVariants([]);

    try {
      const response = await fetch("/api/ai/ad-copy", {
        method: "POST",
        headers: appendCsrfHeader({ "Content-Type": "application/json" }, csrfToken),
        body: JSON.stringify({ businessId, offer, channel, variantCount: 3 })
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
        throw new Error(
          data.code === "AI_QUOTA_EXCEEDED"
            ? "You've reached this month's AI allowance. Upgrade your plan for more."
            : data.error ?? "Failed to generate ad copy."
        );
      }

      const data = (await response.json()) as AdCopyResult;
      setVariants(data.variants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [businessId, offer, channel, csrfToken]);

  return (
    <Card variant="surface" className="space-y-4">
      <header className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-primary-action" />
        <h2 className="section-title">AI campaign copy</h2>
      </header>
      <p className="text-sm text-ink-muted">
        Describe an offer and let the AI draft channel-ready copy variants. Generations count toward your
        monthly AI allowance.
      </p>

      <div className="grid gap-3">
        <textarea
          value={offer}
          onChange={(event) => setOffer(event.target.value)}
          placeholder="e.g. Buy-one-get-one on all coffees this Friday for Gold members"
          rows={3}
          maxLength={500}
          className="w-full rounded-xl border border-line bg-surface-elevated px-3 py-2 text-sm text-ink"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs uppercase tracking-wide text-ink-muted" htmlFor="ad-copy-channel">
            Channel
          </label>
          <select
            id="ad-copy-channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value as AdCopyChannel)}
            className="rounded-lg border border-line bg-surface-elevated px-2 py-1.5 text-sm text-ink"
          >
            {CHANNELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button variant="primary" size="sm" onClick={handleGenerate} disabled={isLoading || !csrfToken}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
            <span className="ml-2">Generate copy</span>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3">
          <p className="text-sm text-danger">{error}</p>
          <button onClick={() => setError(null)} aria-label="Dismiss error" className="shrink-0 text-ink-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {variants.length > 0 ? (
        <div className="grid gap-3">
          {variants.map((variant, index) => (
            <VariantCard key={index} variant={variant} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}
