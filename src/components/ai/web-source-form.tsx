"use client";

import { useState, useTransition } from "react";
import { Globe, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useCsrfToken } from "@/hooks/use-csrf-token";
import { appendCsrfHeader } from "@/lib/csrf";

type WebSourceFormProps = {
  businessId: string;
};

const REFRESH_OPTIONS = [
  { value: 0, label: "Manual only" },
  { value: 7, label: "Weekly" },
  { value: 30, label: "Monthly" },
  { value: 90, label: "Quarterly" }
];

export function WebSourceForm({ businessId }: WebSourceFormProps) {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const [rootUrl, setRootUrl] = useState("");
  const [maxDepth, setMaxDepth] = useState(2);
  const [maxPages, setMaxPages] = useState(25);
  const [refreshIntervalDays, setRefreshIntervalDays] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = () => {
    const trimmed = rootUrl.trim();
    if (!trimmed) {
      setStatus("Enter a web page URL.");
      return;
    }

    startTransition(async () => {
      setStatus("Starting crawl…");
      try {
        const response = await fetch("/api/ai/web-sources", {
          method: "POST",
          headers: appendCsrfHeader({ "Content-Type": "application/json" }, csrfToken),
          body: JSON.stringify({ businessId, rootUrl: trimmed, maxDepth, maxPages, refreshIntervalDays })
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not add web source.");
        }
        setStatus("Crawl started. Pages will appear as they are indexed.");
        setRootUrl("");
        router.refresh();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to add web source.");
      }
    });
  };

  return (
    <div className="grid gap-3">
      <p className="text-sm text-ink-muted">
        Point the AI at your website. We crawl public pages on that domain and use the text to
        answer customer questions from your real material.
      </p>

      <input
        value={rootUrl}
        onChange={(event) => setRootUrl(event.target.value)}
        placeholder="https://your-business.co.za"
        inputMode="url"
        autoComplete="url"
        className="input"
        aria-label="Website URL"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-xs text-ink-muted">
          Crawl depth
          <select
            value={maxDepth}
            onChange={(event) => setMaxDepth(Number(event.target.value))}
            className="input"
          >
            {[0, 1, 2, 3].map((depth) => (
              <option key={depth} value={depth}>
                {depth === 0 ? "This page only" : `${depth} link${depth > 1 ? "s" : ""} deep`}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-xs text-ink-muted">
          Max pages
          <input
            type="number"
            min={1}
            max={50}
            value={maxPages}
            onChange={(event) =>
              setMaxPages(Math.max(1, Math.min(50, Number(event.target.value) || 1)))
            }
            className="input"
          />
        </label>

        <label className="grid gap-1 text-xs text-ink-muted">
          Refresh
          <select
            value={refreshIntervalDays}
            onChange={(event) => setRefreshIntervalDays(Number(event.target.value))}
            className="input"
          >
            {REFRESH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={onSubmit} disabled={isPending || !csrfToken}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
          Add web source
        </Button>
        {status ? (
          <p className="text-xs text-ink-muted" aria-live="polite" role="status">
            {status}
          </p>
        ) : null}
      </div>
    </div>
  );
}
