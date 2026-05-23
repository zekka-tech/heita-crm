export const storageClient = {
  endpoint: process.env.MINIO_ENDPOINT ?? process.env.R2_PUBLIC_URL ?? null,
  bucket: process.env.MINIO_BUCKET ?? process.env.R2_BUCKET_NAME ?? null
};
