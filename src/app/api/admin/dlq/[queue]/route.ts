import { NextResponse } from "next/server";

import {
  DOCUMENT_INGESTION_DLQ,
  getDocumentIngestionQueue,
  getIngestionDlq
} from "@/lib/ai/ingestion-queue";
import {
  CUSTOMER_IMPORT_DLQ,
  getCustomerImportDlq,
  getCustomerImportQueue
} from "@/lib/customer-import-queue";
import { logger } from "@/lib/logger";
import { constantTimeEqual } from "@/lib/security";

export const dynamic = "force-dynamic";

const SUPPORTED_QUEUES = [DOCUMENT_INGESTION_DLQ, CUSTOMER_IMPORT_DLQ];

function isAuthorized(request: Request): boolean {
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.CRON_SECRET;
  if (!provided || !expected) return false;
  return constantTimeEqual(provided, expected);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ queue: string }> }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { queue } = await params;

  if (!SUPPORTED_QUEUES.includes(queue)) {
    return NextResponse.json(
      { error: `Unknown queue. Supported: ${SUPPORTED_QUEUES.join(", ")}` },
      { status: 400 }
    );
  }

  let body: { jobId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  try {
    if (queue === DOCUMENT_INGESTION_DLQ) {
      const dlq = getIngestionDlq();
      const mainQueue = getDocumentIngestionQueue();
      if (!dlq || !mainQueue) {
        return NextResponse.json({ error: "Queue not available." }, { status: 503 });
      }
      const jobs = await dlq.getJobs(["waiting", "failed"]);
      const job = jobs.find((j) => j.id === body.jobId);
      if (!job) {
        return NextResponse.json({ error: "Job not found in DLQ." }, { status: 404 });
      }
      await mainQueue.add("ingest-document", job.data as { documentId: string }, {
        jobId: `replay:${job.id}:${Date.now()}`
      });
      await job.remove();
      logger.info({ jobId: job.id, queue }, "dlq.job.replayed");
    } else {
      const dlq = getCustomerImportDlq();
      const mainQueue = getCustomerImportQueue();
      if (!dlq || !mainQueue) {
        return NextResponse.json({ error: "Queue not available." }, { status: 503 });
      }
      const jobs = await dlq.getJobs(["waiting", "failed"]);
      const job = jobs.find((j) => j.id === body.jobId);
      if (!job) {
        return NextResponse.json({ error: "Job not found in DLQ." }, { status: 404 });
      }
      await mainQueue.add("customer-import", job.data as { importRunId: string }, {
        jobId: `replay:${job.id}:${Date.now()}`
      });
      await job.remove();
      logger.info({ jobId: job.id, queue }, "dlq.job.replayed");
    }

    return NextResponse.json({ ok: true, replayed: body.jobId });
  } catch (err) {
    logger.error({ err, jobId: body.jobId, queue }, "dlq.replay.error");
    return NextResponse.json({ error: "Failed to replay job." }, { status: 500 });
  }
}
