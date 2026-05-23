import { Card } from "@/components/ui/card";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <Card variant="surface" className="space-y-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
        <p className="text-sm leading-6 text-ink-muted">
          Heita stores only the customer, membership, loyalty, messaging, and consent data
          required to operate loyalty programmes for South African retailers. We record
          consent events, support account export, and support self-service deletion flows in
          line with POPIA expectations.
        </p>
        <p className="text-sm leading-6 text-ink-muted">
          Business operators see only their own customer and conversation data. AI workspace
          content is scoped by business and stored separately from public customer views.
        </p>
      </Card>
    </main>
  );
}
