"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-10 w-10 text-danger" />
      <div className="space-y-1">
        <h2 className="font-display text-xl font-bold">Something went wrong</h2>
        <p className="text-sm text-ink-muted">We couldn&apos;t load your home feed.</p>
        {error.digest && <p className="font-mono text-xs text-ink-subtle">ID: {error.digest}</p>}
      </div>
      <Button variant="primary" onClick={reset}>Try again</Button>
    </main>
  );
}
