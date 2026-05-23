import { Card } from "@/components/ui/card";

export const metadata = { title: "Cookie Preferences" };

export default function CookiesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <Card variant="surface" className="space-y-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Cookie Preferences</h1>
        <p className="text-sm leading-6 text-ink-muted">
          Heita uses essential cookies for authentication, session continuity, and security
          controls such as rate limiting and anti-abuse checks. Non-essential analytics are
          not enabled in this build.
        </p>
      </Card>
    </main>
  );
}
