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
  // Only trust X-Forwarded-For when the request comes from a known reverse
  // proxy. TRUSTED_PROXY_IPS is a comma-separated list of load-balancer IPs
  // set at deploy time.
  //
  // If TRUSTED_PROXY_IPS is empty we cannot verify the proxy chain, so we
  // refuse to honour X-Forwarded-For (an attacker-controlled header) and
  // fall back to X-Real-IP which is harder to spoof through a real proxy.
  const trustedProxies = (process.env.TRUSTED_PROXY_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const remoteIp = headers.get("x-real-ip") ?? "0.0.0.0";

  if (trustedProxies.length === 0) {
    // No trusted proxies configured — never honour X-Forwarded-For.
    return remoteIp;
  }

  const isTrustedProxy = trustedProxies.some(
    (proxy) => remoteIp === proxy || remoteIp.startsWith(proxy)
  );

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

/**
 * Assert that a URL's hostname belongs to Heita's own storage buckets
 * (Cloudflare R2 or MinIO). Rejects any URL that could target internal
 * services or third-party hosts, preventing SSRF in OCR / upload flows.
 *
 * Allowed hostnames are derived from R2_PUBLIC_URL and MINIO_ENDPOINT env vars
 * so the check automatically adapts to staging / prod bucket URLs.
 */
export function assertOwnedStorageUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`assertOwnedStorageUrl: invalid URL "${url}"`);
  }

  const allowedHostnames = new Set<string>();

  const r2Public = process.env.R2_PUBLIC_URL;
  if (r2Public) {
    try {
      allowedHostnames.add(new URL(r2Public).hostname);
    } catch { /* malformed R2_PUBLIC_URL — skip */ }
  }

  const minioEndpoint = process.env.MINIO_ENDPOINT;
  if (minioEndpoint) {
    try {
      allowedHostnames.add(new URL(minioEndpoint).hostname);
    } catch { /* malformed MINIO_ENDPOINT — skip */ }
  }

  if (allowedHostnames.size === 0) {
    // No storage URLs configured — fail closed to avoid SSRF in prod.
    throw new Error(
      "assertOwnedStorageUrl: no storage hostnames configured (set R2_PUBLIC_URL or MINIO_ENDPOINT)"
    );
  }

  if (!allowedHostnames.has(parsed.hostname)) {
    throw new Error(
      `assertOwnedStorageUrl: hostname "${parsed.hostname}" is not an allowed storage host`
    );
  }
}
