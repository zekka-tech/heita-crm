import { Card } from "@/components/ui/card";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <Card variant="surface" className="space-y-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Terms of Service</h1>
        <p className="text-sm leading-6 text-ink-muted">
          By creating a Heita account you agree to use the platform lawfully, keep your
          loyalty information accurate, and avoid abusive or fraudulent activity. Businesses
          remain responsible for the rewards, messages, and promotions they publish.
        </p>
        <p className="text-sm leading-6 text-ink-muted">
          Heita may suspend access where fraud, abuse, or regulatory requirements make that
          necessary. Account deletion and data export remain available to end users.
        </p>
      </Card>
    </main>
  );
}
