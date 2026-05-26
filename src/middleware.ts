import { NextResponse } from "next/server";
import NextAuth from "next-auth";

import { authBaseConfig } from "@/lib/auth.config";
import {
  CSRF_COOKIE,
  generateCsrfToken,
  isValidCsrfToken
} from "@/lib/csrf";
import { deploymentReadOnlyEnabled, env } from "@/lib/env";
import { requestIdHeader, resolveRequestId } from "@/lib/request-context";

const { auth } = NextAuth(authBaseConfig);
const protectedPrefixes = [
  "/home",
  "/wallet",
  "/notifications",
  "/profile",
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
    `script-src 'strict-dynamic' 'nonce-${nonce}' https: 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' data: blob: ${IMG_SRC_DOMAINS}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' ${CONNECT_SRC_DOMAINS}`,
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
    httpOnly: false,
    sameSite: "lax",
    // secure must only be true in production so localhost dev works without HTTPS
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  return token;
}

function applySecurityHeaders(response: NextResponse, nonce: string): void {
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  // x-nonce lets Server Components read the nonce for <Script nonce={nonce}>
  response.headers.set("x-nonce", nonce);
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
    const response = NextResponse.redirect(new URL("/home", request.nextUrl));
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

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(requestIdHeader, requestId);
  // Pass nonce to Server Components via request header
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
  const token = ensureCsrfCookie(response, incomingCsrf);
  return decoratePageResponse(response, requestId, token, nonce);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
