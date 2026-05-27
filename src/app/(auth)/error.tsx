"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AuthError({
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
    <div className="flex flex-col items-center gap-5 w-full max-w-sm text-center">
      <div className="rounded-full bg-red-100 p-3">
        <AlertTriangle className="h-6 w-6 text-red-500" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h2 className="font-display text-lg font-bold text-ink">
          Something went wrong
        </h2>
        <p className="text-sm text-ink-muted">
          We couldn&apos;t complete that action. Please try again.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-ink-subtle mt-1">
            Error: {error.digest}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 w-full">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </div>
    </div>
  );
}
