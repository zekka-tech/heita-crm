import { createHmac, timingSafeEqual } from "node:crypto";

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    const padded = Buffer.alloc(leftBuffer.length);
    timingSafeEqual(leftBuffer, padded);
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hmacSha256(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyMetaWhatsappSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string;
}): boolean {
  if (!input.signatureHeader || !input.appSecret) return false;

  const expected = `sha256=${hmacSha256(input.appSecret, input.rawBody)}`;
  return constantTimeEqual(expected, input.signatureHeader);
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "0.0.0.0"
  );
}

export function isPrivateIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is missing.`);
  }
  return value;
}
