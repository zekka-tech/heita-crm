import { NextResponse } from "next/server";
import NextAuth from "next-auth";

import { authBaseConfig } from "@/lib/auth.config";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  generateCsrfToken,
  isValidCsrfToken
} from "@/lib/csrf";
import { deploymentReadOnlyEnabled } from "@/lib/env";
import { requestIdHeader, resolveRequestId } from "@/lib/request-context";

const { auth } = NextAuth(authBaseConfig);
const protectedPrefixes = [
  "/home",
  "/wallet",
  "/notifications",
  "/profile",
  "/connect",
  "/dashboard",
  "/onboard"
];
const authPrefixes = ["/sign-in", "/sign-up"];
const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const isProd = process.env.NODE_ENV === "production";

// Allowlisted external domains for CSP connect-src (client-side fetch/WS).
// Server-to-server calls (Anthropic, WhatsApp, AT) are NOT client-side and
// do not need to appear here.
const CONNECT_SRC_DOMAINS = [
  "https://challenges.cloudflare.com",
  "https://*.ingest.sentry.io",
  "wss://ws-ap2.pusher.com",
  "https://sockjs-ap2.pusher.com",
  ...(isProd ? [] : ["ws://localhost:* http://localhost:*"])
].join(" ");

// Allowlisted external image origins.
const IMG_SRC_DOMAINS = [
  "https://*.r2.cloudflarestorage.com",
  "https://*.cloudfront.net",
  "https://*.googleusercontent.com",
  "https://avatars.githubusercontent.com",
  "https://www.gravatar.com"
].join(" ");

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // strict-dynamic: scripts loaded via the nonce may load other scripts.
    // unsafe-inline is ignored in CSP3 browsers when strict-dynamic is present.
    // https: covers legacy browsers that don't support strict-dynamic.
    // 'wasm-unsafe-eval' lets the client-side receipt OCR engine (Tesseract.js)
    // compile its self-hosted WebAssembly core. It only permits WASM
    // compilation/instantiation — not arbitrary JS eval — so it is far tighter
    // than 'unsafe-eval' and the standard way to allow WASM under a strict CSP.
    `script-src 'strict-dynamic' 'nonce-${nonce}' 'wasm-unsafe-eval' https: 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' data: blob: ${IMG_SRC_DOMAINS}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' ${CONNECT_SRC_DOMAINS}`,
    // Tesseract.js spawns its (self-hosted /tesseract/worker.min.js) Web Worker
    // from a same-origin blob: URL (workerBlobURL). 'self' alone is insufficient.
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests"
  ].join("; ");
}

function ensureCsrfCookie(response: NextResponse, existing: string | undefined): string {
  if (existing && isValidCsrfToken(existing)) {
    return existing;
  }
  const token = generateCsrfToken();
  response.cookies.set(CSRF_COOKIE, token, {
    // httpOnly must stay false: useCsrfToken() reads this via document.cookie
    // to include it in the x-heita-csrf request header (double-submit pattern).
    httpOnly: false,
    sameSite: "strict",
    // __Host- prefix requires Secure=true always (Chromium allows Secure on http://localhost)
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  return token;
}

function applySecurityHeaders(response: NextResponse, nonce: string): void {
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  // x-nonce lets Server Components read the nonce for <Script nonce={nonce}>
  response.headers.set("x-nonce", nonce);
  // Isolates the browsing context to prevent cross-origin window references
  // (Spectre-class side-channel attacks via SharedArrayBuffer etc.)
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
}

function decoratePageResponse(
  response: NextResponse,
  requestId: string,
  csrfToken: string,
  nonce: string
): NextResponse {
  response.headers.set(requestIdHeader, requestId);
  response.headers.set("x-heita-csrf", csrfToken);
  applySecurityHeaders(response, nonce);
  return response;
}

function decorateApiResponse(response: NextResponse, requestId: string): NextResponse {
  response.headers.set(requestIdHeader, requestId);
  return response;
}

export default auth((request) => {
  const requestId = resolveRequestId(request.headers);
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const isMutation = mutationMethods.has(request.method);
  const isAuthenticated = Boolean(request.auth);
  const isProtectedRoute = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isAuthRoute = authPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const incomingCsrf = request.cookies.get(CSRF_COOKIE)?.value;

  if (deploymentReadOnlyEnabled() && isMutation) {
    const retryAfterSeconds = "60";
    if (isApiRoute) {
      return decorateApiResponse(
        NextResponse.json(
          {
            error:
              "Heita is temporarily in read-only mode for deployment. Please retry shortly."
          },
          {
            status: 503,
            headers: {
              "Retry-After": retryAfterSeconds
            }
          }
        ),
        requestId
      );
    }

    return decoratePageResponse(
      new NextResponse(
        "Heita is temporarily in read-only mode for deployment. Please retry shortly.",
        {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Retry-After": retryAfterSeconds
          }
        }
      ),
      requestId,
      incomingCsrf && isValidCsrfToken(incomingCsrf) ? incomingCsrf : generateCsrfToken(),
      nonce
    );
  }

  if (!isAuthenticated && isProtectedRoute) {
    const signInUrl = new URL("/sign-in", request.nextUrl);
    signInUrl.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(signInUrl);
    const token = ensureCsrfCookie(response, incomingCsrf);
    return decoratePageResponse(response, requestId, token, nonce);
  }

  if (isAuthenticated && isAuthRoute) {
    const rawCallback = request.nextUrl.searchParams.get("callbackUrl");
    // Only honour same-origin paths — prevent open-redirect via callbackUrl
    const safeCallback =
      rawCallback && rawCallback.startsWith("/") && !rawCallback.startsWith("//")
        ? rawCallback
        : "/home";
    const response = NextResponse.redirect(new URL(safeCallback, request.nextUrl));
    const token = ensureCsrfCookie(response, incomingCsrf);
    return decoratePageResponse(response, requestId, token, nonce);
  }

  if (isApiRoute) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(requestIdHeader, requestId);
    const response = NextResponse.next({
      request: {
        headers: requestHeaders
      }
    });
    return decorateApiResponse(response, requestId);
  }

  // Pre-compute the CSRF token so it can be injected into the forwarded
  // request headers. Server Components read cookies() from the REQUEST,
  // not the response, so they never see a cookie set for the first time
  // by middleware. Forwarding via request headers (like x-nonce) is the
  // only reliable path on first load.
  const csrfToken = isValidCsrfToken(incomingCsrf) ? incomingCsrf : generateCsrfToken();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(requestIdHeader, requestId);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(CSRF_HEADER, csrfToken);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
  if (!isValidCsrfToken(incomingCsrf)) {
    response.cookies.set(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7
    });
  }
  return decoratePageResponse(response, requestId, csrfToken, nonce);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/health).*)"]
};
