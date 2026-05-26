import { NextResponse } from "next/server";

import { getIngestionDlq } from "@/lib/ai/ingestion-queue";
import { getCustomerImportDlq } from "@/lib/customer-import-queue";
import { constantTimeEqual } from "@/lib/security";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.CRON_SECRET;
  if (!provided || !expected) return false;
  return constantTimeEqual(provided, expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ingestionDlq = getIngestionDlq();
  const importDlq = getCustomerImportDlq();

  const [ingestionJobs, importJobs] = await Promise.all([
    ingestionDlq?.getJobs(["waiting", "failed"]) ?? [],
    importDlq?.getJobs(["waiting", "failed"]) ?? []
  ]);

  const toSummary = (job: { id?: string; data?: unknown; failedReason?: string; timestamp?: number }) => ({
    jobId: job.id,
    data: job.data,
    failedReason: job.failedReason,
    enqueuedAt: job.timestamp ? new Date(job.timestamp).toISOString() : null
  });

  return NextResponse.json({
    queues: {
      "document-ingestion-dlq": ingestionJobs.map(toSummary),
      "customer-import-dlq": importJobs.map(toSummary)
    },
    totals: {
      "document-ingestion-dlq": ingestionJobs.length,
      "customer-import-dlq": importJobs.length
    }
  });
}
