import { handleRefreshWebSource } from "@/server/http/web-source-handlers";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleRefreshWebSource(request, id);
}
