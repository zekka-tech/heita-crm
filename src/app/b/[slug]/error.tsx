"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Building2, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function BusinessError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <Card variant="surface" className="max-w-sm w-full space-y-5 py-8 px-6">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full bg-amber-100 p-3">
            <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-ink">
              Could not load this page
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              The business profile failed to load. Please try again.
            </p>
            {error.digest && (
              <p className="mt-1 font-mono text-xs text-ink-subtle">
                Error: {error.digest}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/discover">
              <Building2 className="h-4 w-4" />
              Browse businesses
            </Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
