export async function runDocumentIngestionJob(jobId: string) {
  return {
    jobId,
    status: "queued"
  };
}

