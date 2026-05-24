import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import type { NextApiRequest, NextApiResponse } from "next";
import { NextRequest } from "next/server";

function toHeaders(input: NextApiRequest["headers"]) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (typeof value === "string") {
      headers.set(name, value);
    }
  }

  return headers;
}

async function toRequestBody(req: NextApiRequest) {
  if (req.body == null) {
    return undefined;
  }

  if (typeof req.body === "string") {
    return req.body;
  }

  if (Buffer.isBuffer(req.body)) {
    return new Uint8Array(req.body);
  }

  const contentType = req.headers["content-type"] ?? "";
  const normalizedContentType = Array.isArray(contentType) ? contentType[0] ?? "" : contentType;

  if (normalizedContentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          params.append(key, String(item));
        }
      } else if (value !== undefined) {
        params.set(key, String(value));
      }
    }
    return params.toString();
  }

  return JSON.stringify(req.body);
}

export async function nextApiRequestToRequest(req: NextApiRequest) {
  const origin =
    (typeof req.headers.origin === "string" ? req.headers.origin : null) ??
    (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000");
  const url = `${origin}${req.url ?? "/"}`;

  return new NextRequest(url, {
    method: req.method ?? "GET",
    headers: toHeaders(req.headers),
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await toRequestBody(req)
  });
}

export async function writeFetchResponseToNextApi(
  res: NextApiResponse,
  response: Response
) {
  res.status(response.status);
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const stream = Readable.fromWeb(
    response.body as unknown as NodeReadableStream<Uint8Array>
  );

  await new Promise<void>((resolve, reject) => {
    stream.on("error", reject);
    res.on("close", resolve);
    res.on("finish", resolve);
    stream.pipe(res);
  });
}
