import { Job } from "bullmq";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getIngestionDlq } from "@/lib/ai/ingestion-queue";
import { getCustomerImportDlq } from "@/lib/customer-import-queue";
import { setDlqPendingGauge } from "@/lib/metrics";
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

  // Update Prometheus gauge so heita_dlq_pending_jobs reflects current state
  setDlqPendingGauge("document-ingestion-dlq", ingestionJobs.length);
  setDlqPendingGauge("customer-import-dlq", importJobs.length);

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

const RetryBodySchema = z.object({
  queue: z.enum(["document-ingestion-dlq", "customer-import-dlq"]),
  jobId: z.string().min(1)
});

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = RetryBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { queue: queueName, jobId } = parsed.data;

  const dlq = queueName === "document-ingestion-dlq" ? getIngestionDlq() : getCustomerImportDlq();
  if (!dlq) {
    return NextResponse.json({ error: "Queue unavailable." }, { status: 503 });
  }

  const job: Job | undefined = await Job.fromId(dlq, jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const failed = await job.isFailed();
  if (!failed) {
    return NextResponse.json({ error: "Job is not in a failed state." }, { status: 400 });
  }

  await job.retry("failed");

  return NextResponse.json({ ok: true, jobId });
}
