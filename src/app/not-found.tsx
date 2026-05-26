import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary-action">404</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
          Page not found
        </h1>
        <p className="text-sm text-ink-muted max-w-sm">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Button variant="primary" asChild>
        <Link href="/">Go home</Link>
      </Button>
    </main>
  );
}
