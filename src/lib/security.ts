import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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

/**
 * Comprehensive check for IP addresses that must never be reachable from a
 * server-side fetch (SSRF defence): loopback, private, link-local, CGNAT,
 * unique-local, cloud-metadata, and unspecified ranges, for both IPv4 and IPv6.
 * Broader than {@link isPrivateIp}, which is kept for existing callers.
 */
export function isDisallowedFetchAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return true; // not a valid IP literal — reject

  if (family === 4) {
    const octets = ip.split(".").map((part) => Number(part));
    if (octets.length !== 4 || octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = octets as [number, number, number, number];
    return (
      a === 0 || // 0.0.0.0/8 "this host"
      a === 127 || // loopback
      a === 10 || // private
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 169 && b === 254) || // link-local incl. 169.254.169.254 metadata
      (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
      (a === 192 && b === 0) || // 192.0.0/24 + 192.0.2/24 reserved/TEST-NET
      (a === 198 && (b === 18 || b === 19)) || // 198.18/15 benchmarking
      a >= 224 // multicast + reserved (224+)
    );
  }

  // IPv6
  const normalized = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded IPv4.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isDisallowedFetchAddress(mapped[1]!);
  return (
    normalized === "::1" || // loopback
    normalized === "::" || // unspecified
    normalized.startsWith("fe80") || // link-local
    normalized.startsWith("fc") || // unique-local fc00::/7
    normalized.startsWith("fd") ||
    normalized.startsWith("fec0") || // deprecated site-local
    normalized.startsWith("ff") // multicast
  );
}

/**
 * Assert that a URL is safe for the server to fetch (SSRF defence for the web
 * crawler): it must be http(s), carry no embedded credentials, and resolve only
 * to public IP addresses. Re-run this for every fetched URL, including each
 * redirect hop (use `redirect: "manual"`).
 *
 * Returns the resolved public IPs so callers can pin the connection if needed.
 */
export async function assertPublicHttpUrl(url: string): Promise<string[]> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`assertPublicHttpUrl: invalid URL "${url}"`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`assertPublicHttpUrl: unsupported protocol "${parsed.protocol}"`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("assertPublicHttpUrl: URLs with embedded credentials are not allowed");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  // If the host is already an IP literal, check it directly.
  if (isIP(hostname) !== 0) {
    if (isDisallowedFetchAddress(hostname)) {
      throw new Error(`assertPublicHttpUrl: address "${hostname}" is not publicly routable`);
    }
    return [hostname];
  }

  // Resolve the hostname and reject if ANY resolved address is disallowed
  // (defends against DNS records that point at internal ranges).
  let records: { address: string }[];
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    throw new Error(`assertPublicHttpUrl: could not resolve host "${hostname}"`);
  }
  if (records.length === 0) {
    throw new Error(`assertPublicHttpUrl: host "${hostname}" did not resolve`);
  }
  for (const record of records) {
    if (isDisallowedFetchAddress(record.address)) {
      throw new Error(
        `assertPublicHttpUrl: host "${hostname}" resolves to non-public address ${record.address}`
      );
    }
  }
  return records.map((record) => record.address);
}
