import { Readable } from "node:stream";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageProvider = "r2" | "minio";

export type StorageConfig = {
  provider: StorageProvider;
  bucket: string;
  endpoint?: string;
  region: string;
  publicUrl?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

type PresignedUploadInput = {
  key: string;
  contentType: string;
  byteSize: number;
};

declare global {
  var __heitaStorageClient__: S3Client | undefined;
}

function getR2Endpoint(accountId: string) {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function getStorageConfig(): StorageConfig | null {
  if (
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  ) {
    return {
      provider: "r2",
      bucket: process.env.R2_BUCKET_NAME,
      endpoint: getR2Endpoint(process.env.R2_ACCOUNT_ID),
      publicUrl: process.env.R2_PUBLIC_URL || undefined,
      region: "auto",
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      forcePathStyle: false
    };
  }

  if (
    process.env.MINIO_ENDPOINT &&
    process.env.MINIO_ACCESS_KEY &&
    process.env.MINIO_SECRET_KEY &&
    process.env.MINIO_BUCKET
  ) {
    return {
      provider: "minio",
      bucket: process.env.MINIO_BUCKET,
      endpoint: process.env.MINIO_ENDPOINT,
      publicUrl: process.env.MINIO_ENDPOINT,
      region: "us-east-1",
      accessKeyId: process.env.MINIO_ACCESS_KEY,
      secretAccessKey: process.env.MINIO_SECRET_KEY,
      forcePathStyle: true
    };
  }

  return null;
}

export function storageConfigured() {
  return Boolean(getStorageConfig());
}

export function getStorageClient() {
  const config = getStorageConfig();
  if (!config) {
    return null;
  }

  if (!global.__heitaStorageClient__) {
    global.__heitaStorageClient__ = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
  }

  return global.__heitaStorageClient__;
}

export async function createPresignedUpload(input: PresignedUploadInput) {
  const config = getStorageConfig();
  const client = getStorageClient();

  if (!config || !client) {
    throw new Error("Object storage is not configured.");
  }

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.byteSize
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: 15 * 60
  });

  return {
    uploadUrl,
    method: "PUT" as const,
    headers: {
      "Content-Type": input.contentType
    }
  };
}

export async function putStoredObject(input: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
}) {
  const config = getStorageConfig();
  const client = getStorageClient();

  if (!config || !client) {
    throw new Error("Object storage is not configured.");
  }

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType
    })
  );

  return {
    key: input.key,
    url: getStoredObjectUrl(input.key)
  };
}

function streamToBuffer(stream: Readable | ReadableStream<Uint8Array>) {
  if (stream instanceof Readable) {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  return (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  })();
}

export async function deleteStoredObject(key: string) {
  const config = getStorageConfig();
  const client = getStorageClient();

  if (!config || !client) {
    return;
  }

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key
    })
  );
}

export async function getStoredObjectBuffer(key: string) {
  const config = getStorageConfig();
  const client = getStorageClient();

  if (!config || !client) {
    throw new Error("Object storage is not configured.");
  }

  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key
    })
  );

  if (!response.Body) {
    throw new Error("Stored object body was empty.");
  }

  return streamToBuffer(response.Body as Readable | ReadableStream<Uint8Array>);
}

export function getStoredObjectUrl(key: string) {
  const config = getStorageConfig();
  if (!config?.publicUrl) {
    return null;
  }

  const trimmedBase = config.publicUrl.replace(/\/$/, "");
  if (config.provider === "minio") {
    return `${trimmedBase}/${config.bucket}/${key}`;
  }

  return `${trimmedBase}/${key}`;
}

export async function checkStorageHealth() {
  const config = getStorageConfig();
  const client = getStorageClient();

  if (!config || !client) {
    return {
      ok: false,
      reason: "not_configured"
    };
  }

  const startedAt = Date.now();

  try {
    await client.send(
      new HeadBucketCommand({
        Bucket: config.bucket
      })
    );

    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      provider: config.provider
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message : "storage_check_failed",
      provider: config.provider
    };
  }
}
