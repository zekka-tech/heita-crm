import { PlaceholderPage } from "@/components/shared/placeholder-page";

type BusinessEventsPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BusinessEventsPage({
  params
}: BusinessEventsPageProps) {
  const { slug } = await params;

  return (
    <main className="px-4 py-6 sm:px-8">
      <PlaceholderPage
        eyebrow={`Events / ${slug}`}
        title="Business events"
        description="Upcoming launches, flash sales, classes, and reminders will be rendered on this public-facing event surface."
      />
    </main>
  );
}

