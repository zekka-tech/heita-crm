import { handleCreateWebSource } from "@/server/http/web-source-handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCreateWebSource(request);
}
