import { createHmac, timingSafeEqual } from "node:crypto";

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  const maxLength = Math.max(leftBuffer.length, rightBuffer.length, 1);
  const paddedLeft = Buffer.alloc(maxLength);
  const paddedRight = Buffer.alloc(maxLength);

  leftBuffer.copy(paddedLeft);
  rightBuffer.copy(paddedRight);

  const equal = timingSafeEqual(paddedLeft, paddedRight);
  return equal && leftBuffer.length === rightBuffer.length;
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
  // Only trust X-Forwarded-For / X-Real-IP headers when the request comes
  // from a known reverse proxy. TRUSTED_PROXY_IPS is a comma-separated list
  // of proxy CIDRs/IPs set at deploy time (e.g. the load balancer address).
  // When unset, fall back to the direct connection IP rather than blindly
  // trusting a header that any caller can spoof.
  const trustedProxies = (process.env.TRUSTED_PROXY_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const remoteIp = headers.get("x-real-ip") ?? "0.0.0.0";
  const isTrustedProxy =
    trustedProxies.length === 0 ||
    trustedProxies.some((proxy) => remoteIp === proxy || remoteIp.startsWith(proxy));

  if (isTrustedProxy) {
    return headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? remoteIp;
  }

  return remoteIp;
}

export function isUnixTimestampWithinSkew(
  timestamp: string | number,
  skewSeconds: number,
  now = Date.now()
): boolean {
  const normalizedTimestamp =
    typeof timestamp === "string" ? Number.parseInt(timestamp, 10) : timestamp;

  if (!Number.isFinite(normalizedTimestamp)) {
    return false;
  }

  return Math.abs(now - normalizedTimestamp * 1000) <= skewSeconds * 1000;
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
