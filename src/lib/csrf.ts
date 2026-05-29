// __Host- prefix enforces Secure + Path=/ + no Domain — prevents subdomain cookie shadowing
export const CSRF_COOKIE = "__Host-heita-csrf";
export const CSRF_HEADER = "x-heita-csrf";
export const CSRF_FORM_FIELD = "_csrf";

const TOKEN_LENGTH = 32;
const VALID_TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

function randomToken(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(TOKEN_LENGTH);
    globalThis.crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
  }
  // Fallback shouldn't trigger in Node 19+ or any modern edge runtime.
  let value = "";
  for (let index = 0; index < TOKEN_LENGTH; index += 1) {
    value += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  }
  return value;
}

function base64UrlEncode(bytes: Uint8Array): string {
  // Edge runtime lacks Node Buffer in some paths — use a manual encode.
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  if (typeof btoa === "function") {
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  return Buffer.from(bytes).toString("base64url");
}

function constantTimeTokenEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;

  for (let index = 0; index < maxLength; index += 1) {
    const left = a.charCodeAt(index) || 0;
    const right = b.charCodeAt(index) || 0;
    mismatch |= left ^ right;
  }

  return mismatch === 0;
}

export function isValidCsrfToken(value: string | null | undefined): value is string {
  return typeof value === "string" && VALID_TOKEN.test(value);
}

export function generateCsrfToken(): string {
  return randomToken();
}

export function verifyCsrfTokenPair(
  cookieValue: string | null | undefined,
  providedValue: string | null | undefined
): { ok: true } | CsrfFailure {
  if (!isValidCsrfToken(cookieValue)) {
    return { ok: false, reason: "missing-cookie" };
  }

  if (!isValidCsrfToken(providedValue)) {
    return { ok: false, reason: "missing-token" };
  }

  return constantTimeTokenEqual(cookieValue, providedValue)
    ? { ok: true }
    : { ok: false, reason: "mismatch" };
}

export function appendCsrfHeader(
  headers: HeadersInit | undefined,
  token: string | null | undefined
): Headers {
  const next = new Headers(headers);
  if (isValidCsrfToken(token)) {
    next.set(CSRF_HEADER, token);
  }
  return next;
}

export type CsrfFailure =
  | { ok: false; reason: "missing-cookie" }
  | { ok: false; reason: "missing-token" }
  | { ok: false; reason: "mismatch" };

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const entries = cookieHeader.split(/;\s*/);
  for (const entry of entries) {
    const [key, ...rest] = entry.split("=");
    if (key === name) {
      return rest.join("=") || null;
    }
  }

  return null;
}

export async function readCsrfCookie(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const value = store.get(CSRF_COOKIE)?.value ?? null;
  return isValidCsrfToken(value) ? value : null;
}

export function readCsrfCookieFromRequest(request: Request): string | null {
  const value = getCookieValue(request.headers.get("cookie"), CSRF_COOKIE);
  return isValidCsrfToken(value) ? value : null;
}

/**
 * Verify the double-submit token from a fetch-style request. The cookie value
 * (set by middleware) is compared against either an `x-heita-csrf` header
 * (preferred for fetch) or a `_csrf` field on the URL-encoded body when
 * present.
 */
export async function verifyCsrfRequest(
  request: Request
): Promise<{ ok: true } | CsrfFailure> {
  const cookieValue = readCsrfCookieFromRequest(request);
  const headerValue = request.headers.get(CSRF_HEADER);
  return verifyCsrfTokenPair(cookieValue, headerValue);
}

/**
 * Server-action variant: validate FormData's `_csrf` field against the cookie.
 */
export async function verifyCsrfFormData(
  formData: FormData
): Promise<{ ok: true } | CsrfFailure> {
  const cookieValue = await readCsrfCookie();
  const provided = formData.get(CSRF_FORM_FIELD);
  return verifyCsrfTokenPair(cookieValue, typeof provided === "string" ? provided : null);
}

export async function requireCsrfRequest(request: Request): Promise<void> {
  const result = await verifyCsrfRequest(request);
  if (!result.ok) {
    throw new CsrfError(result.reason);
  }
}

export async function requireCsrfFormData(formData: FormData): Promise<void> {
  const result = await verifyCsrfFormData(formData);
  if (!result.ok) {
    throw new CsrfError(result.reason);
  }
}

export class CsrfError extends Error {
  readonly reason: CsrfFailure["reason"];

  constructor(reason: CsrfFailure["reason"]) {
    super(`csrf:${reason}`);
    this.name = "CsrfError";
    this.reason = reason;
  }
}

/**
 * Helper for API routes: returns a 403 response when the double-submit token
 * is missing or wrong, or null when the request is allowed through. Keeps the
 * shape consistent so every mutation route uses the same error envelope.
 */
export async function csrfFailureResponse(
  request: Request
): Promise<Response | null> {
  const result = await verifyCsrfRequest(request);
  if (result.ok) return null;

  return new Response(
    JSON.stringify({ error: "CSRF validation failed.", reason: result.reason }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" }
    }
  );
}
