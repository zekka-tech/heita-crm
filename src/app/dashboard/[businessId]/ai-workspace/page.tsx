import { PlaceholderPage } from "@/components/shared/placeholder-page";

type AiWorkspacePageProps = {
  params: Promise<{ businessId: string }>;
};

export default async function AiWorkspacePage({ params }: AiWorkspacePageProps) {
  const { businessId } = await params;

  return (
    <main className="px-4 py-6 sm:px-8">
      <PlaceholderPage
        eyebrow={`AI Workspace / ${businessId}`}
        title="Document-aware co-working space"
        description="Upload flows, ingestion status, retrieved context previews, and staff chat threads will live in this dashboard section."
      />
    </main>
  );
}

