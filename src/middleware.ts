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

function ensureCsrfCookie(response: NextResponse, existing: string | undefined): string {
  if (existing && isValidCsrfToken(existing)) {
    return existing;
  }
  const token = generateCsrfToken();
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  return token;
}

function decoratePageResponse(
  response: NextResponse,
  requestId: string,
  csrfToken: string
): NextResponse {
  response.headers.set(requestIdHeader, requestId);
  response.headers.set("x-heita-csrf", csrfToken);
  return response;
}

function decorateApiResponse(response: NextResponse, requestId: string): NextResponse {
  response.headers.set(requestIdHeader, requestId);
  return response;
}

export default auth((request) => {
  const requestId = resolveRequestId(request.headers);
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
      incomingCsrf && isValidCsrfToken(incomingCsrf) ? incomingCsrf : generateCsrfToken()
    );
  }

  if (!isAuthenticated && isProtectedRoute) {
    const signInUrl = new URL("/sign-in", request.nextUrl);
    signInUrl.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(signInUrl);
    const token = ensureCsrfCookie(response, incomingCsrf);
    return decoratePageResponse(response, requestId, token);
  }

  if (isAuthenticated && isAuthRoute) {
    const response = NextResponse.redirect(new URL("/home", request.nextUrl));
    const token = ensureCsrfCookie(response, incomingCsrf);
    return decoratePageResponse(response, requestId, token);
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
  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
  const token = ensureCsrfCookie(response, incomingCsrf);
  return decoratePageResponse(response, requestId, token);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
