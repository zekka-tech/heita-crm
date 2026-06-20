"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DashboardPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-8 w-8 text-danger" />
      <div className="space-y-1">
        <h2 className="font-display text-lg font-bold">Something went wrong</h2>
        <p className="text-sm text-ink-muted">Your data is safe — try refreshing this section.</p>
        {error.digest && (
          <p className="font-mono text-xs text-ink-subtle">Ref: {error.digest}</p>
        )}
      </div>
      <Button variant="primary" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
