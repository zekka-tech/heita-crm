import { PlaceholderPage } from "@/components/shared/placeholder-page";

type BusinessChatPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BusinessChatPage({ params }: BusinessChatPageProps) {
  const { slug } = await params;

  return (
    <main className="px-4 py-6 sm:px-8">
      <PlaceholderPage
        eyebrow={`Business Chat / ${slug}`}
        title="Customer AI chat"
        description="This chat surface will stream answers from the business RAG workspace, preferring Ollama and falling back to Anthropic."
      />
    </main>
  );
}

