"use client";

import { useState, useTransition } from "react";
import { Globe, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Chip } from "@/components/ui/badge";
import { useCsrfToken } from "@/hooks/use-csrf-token";
import { appendCsrfHeader } from "@/lib/csrf";

export type WebSourceListItem = {
  id: string;
  rootUrl: string;
  domain: string;
  status: "PENDING" | "CRAWLING" | "READY" | "FAILED";
  pageCount: number;
  refreshIntervalDays: number;
  lastCrawledAt: string | null;
  errorMessage: string | null;
};

const STATUS_VARIANT = {
  READY: "success",
  FAILED: "danger",
  CRAWLING: "warning",
  PENDING: "warning"
} as const;

const REFRESH_LABEL: Record<number, string> = { 0: "Manual", 7: "Weekly", 30: "Monthly", 90: "Quarterly" };

export function WebSourcesList({ sources }: { sources: WebSourceListItem[] }) {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const mutate = (id: string, action: "refresh" | "delete") => {
    setBusyId(id);
    startTransition(async () => {
      try {
        const url = action === "refresh" ? `/api/ai/web-sources/${id}/refresh` : `/api/ai/web-sources/${id}`;
        await fetch(url, {
          method: action === "refresh" ? "POST" : "DELETE",
          headers: appendCsrfHeader(undefined, csrfToken)
        });
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  };

  if (sources.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No web sources yet. Add your website so the AI can answer from your live pages.
      </p>
    );
  }

  return (
    <ul className="grid gap-2">
      {sources.map((source) => (
        <li
          key={source.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-elevated px-3 py-3"
        >
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium text-ink">
              <Globe className="h-3.5 w-3.5 shrink-0 text-primary-action" aria-hidden="true" />
              {source.domain}
            </p>
            <p className="truncate text-xs text-ink-subtle">{source.rootUrl}</p>
            <p className="mt-0.5 text-xs text-ink-subtle">
              {source.pageCount} page{source.pageCount === 1 ? "" : "s"} ·{" "}
              {REFRESH_LABEL[source.refreshIntervalDays] ?? "Manual"}
              {source.lastCrawledAt
                ? ` · ${new Date(source.lastCrawledAt).toLocaleDateString("en-ZA")}`
                : ""}
            </p>
            {source.errorMessage ? (
              <p className="mt-1 text-xs text-danger">{source.errorMessage}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Chip variant={STATUS_VARIANT[source.status]} size="sm">
              {source.status}
            </Chip>
            <button
              type="button"
              onClick={() => mutate(source.id, "refresh")}
              disabled={busyId === source.id || !csrfToken || source.status === "CRAWLING"}
              className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
              aria-label={`Refresh ${source.domain}`}
            >
              {busyId === source.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => mutate(source.id, "delete")}
              disabled={busyId === source.id || !csrfToken}
              className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              aria-label={`Delete ${source.domain}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
