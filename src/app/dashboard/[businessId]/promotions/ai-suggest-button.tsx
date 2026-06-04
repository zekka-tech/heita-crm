"use client";

import { useState, useCallback } from "react";
import { Sparkles, Loader2, Lightbulb, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { useCsrfToken } from "@/hooks/use-csrf-token";
import { appendCsrfHeader } from "@/lib/csrf";
import type { PromotionSuggestion } from "@/server/services/ai-promotion.service";

type AiSuggestButtonProps = {
  businessId: string;
};

function describeType(type: PromotionSuggestion["type"]): string {
  switch (type) {
    case "FLASH_SALE":
      return "Flash sale";
    case "DISCOUNT":
      return "Discount";
    case "BONUS_POINTS":
      return "Bonus points";
  }
}

export function AiSuggestButton({ businessId }: AiSuggestButtonProps) {
  const csrfToken = useCsrfToken();
  const [suggestions, setSuggestions] = useState<PromotionSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSuggest = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSuggestions([]);

    try {
      const response = await fetch("/api/ai/promotion-suggestions", {
        method: "POST",
        headers: appendCsrfHeader(
          { "Content-Type": "application/json" },
          csrfToken
        ),
        body: JSON.stringify({ businessId })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to generate suggestions."
        );
      }

      const data = (await response.json()) as { suggestions: PromotionSuggestion[] };
      setSuggestions(data.suggestions);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsLoading(false);
    }
  }, [businessId, csrfToken]);

  const dismiss = useCallback(() => {
    setSuggestions([]);
    setError(null);
  }, []);

  return (
    <div className="space-y-4">
      <Button
        variant="secondary"
        size="sm"
        onClick={handleSuggest}
        disabled={isLoading || !csrfToken}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        <span className="ml-2">AI Suggest</span>
      </Button>

      {error ? (
        <Card
          variant="surface"
          className="border-danger/30 bg-danger/5 p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-danger">{error}</p>
            <button
              onClick={dismiss}
              className="shrink-0 rounded-full p-0.5 text-ink-muted hover:text-ink"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </Card>
      ) : null}

      {suggestions.length > 0 ? (
        <Card variant="surface" className="space-y-4">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary-action" />
              <h2 className="section-title">AI Suggestions</h2>
            </div>
            <button
              onClick={dismiss}
              className="rounded-full p-1 text-ink-muted hover:text-ink"
              aria-label="Dismiss suggestions"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="grid gap-3">
            {suggestions.map((suggestion, index) => (
              <article
                key={index}
                className="rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-base font-semibold text-ink">
                    {suggestion.name}
                  </h3>
                  <Chip variant="primary" size="sm">
                    {describeType(suggestion.type)}
                  </Chip>
                </div>
                <p className="mt-2 text-sm text-ink-muted">
                  {suggestion.description}
                </p>
                <p className="mt-1 text-xs text-ink-subtle">
                  {suggestion.reason}
                </p>
              </article>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
