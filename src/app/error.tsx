"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Error already captured by Sentry via instrumentation
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
          Something went wrong
        </h1>
        <p className="text-sm text-ink-muted">
          We&apos;ve been notified and are looking into it.
          {error.digest && (
            <span className="block mt-1 text-xs text-ink-subtle font-mono">
              Error ID: {error.digest}
            </span>
          )}
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Button variant="ghost" onClick={() => (window.location.href = "/")}>
          Go home
        </Button>
      </div>
    </main>
  );
}
