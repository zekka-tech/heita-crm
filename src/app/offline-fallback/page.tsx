import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false }
};

export default function OfflineFallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="mx-auto max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
          <WifiOff className="h-8 w-8 text-warning" />
        </div>
        <h1 className="mb-2 text-xl font-semibold text-ink">You&apos;re offline</h1>
        <p className="mb-6 text-sm text-ink-muted">
          This page is not available while you&apos;re disconnected. Please check your
          internet connection and try again.
        </p>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary-dark transition-colors"
        >
          Go to home
        </Link>
      </div>
    </div>
  );
}
