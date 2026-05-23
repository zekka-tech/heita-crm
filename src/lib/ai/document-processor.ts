export async function enqueueDocumentIngestion(documentId: string) {
  return {
    enqueued: true,
    documentId
  };
}

