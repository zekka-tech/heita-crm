import { handlePurgeConnectMessagesCron } from "@/server/http/cron-handlers";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handlePurgeConnectMessagesCron(request);
}
