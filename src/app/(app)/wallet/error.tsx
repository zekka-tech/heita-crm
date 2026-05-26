"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WalletError({
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
        <h2 className="font-display text-xl font-bold">Wallet unavailable</h2>
        <p className="text-sm text-ink-muted">We couldn&apos;t load your loyalty wallet.</p>
        {error.digest && <p className="font-mono text-xs text-ink-subtle">ID: {error.digest}</p>}
      </div>
      <Button variant="primary" onClick={reset}>Try again</Button>
    </main>
  );
}
