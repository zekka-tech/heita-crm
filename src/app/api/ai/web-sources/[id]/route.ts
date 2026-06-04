import { handleDeleteWebSource } from "@/server/http/web-source-handlers";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleDeleteWebSource(request, id);
}
