import { NextResponse } from "next/server";
import NextAuth from "next-auth";

import { authBaseConfig } from "@/lib/auth.config";
import {
  CSRF_COOKIE,
  generateCsrfToken,
  isValidCsrfToken
} from "@/lib/csrf";
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

function ensureCsrfCookie(response: NextResponse, existing: string | undefined): string {
  if (existing && isValidCsrfToken(existing)) {
    return existing;
  }
  const token = generateCsrfToken();
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  return token;
}

function decorateResponse(
  response: NextResponse,
  requestId: string,
  csrfToken: string
): NextResponse {
  response.headers.set(requestIdHeader, requestId);
  response.headers.set("x-heita-csrf", csrfToken);
  return response;
}

export default auth((request) => {
  const requestId = resolveRequestId(request.headers);
  const { pathname } = request.nextUrl;
  const isAuthenticated = Boolean(request.auth);
  const isProtectedRoute = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isAuthRoute = authPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  const incomingCsrf = request.cookies.get(CSRF_COOKIE)?.value;

  if (!isAuthenticated && isProtectedRoute) {
    const signInUrl = new URL("/sign-in", request.nextUrl);
    signInUrl.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(signInUrl);
    const token = ensureCsrfCookie(response, incomingCsrf);
    return decorateResponse(response, requestId, token);
  }

  if (isAuthenticated && isAuthRoute) {
    const response = NextResponse.redirect(new URL("/home", request.nextUrl));
    const token = ensureCsrfCookie(response, incomingCsrf);
    return decorateResponse(response, requestId, token);
  }

  const response = NextResponse.next();
  const token = ensureCsrfCookie(response, incomingCsrf);
  request.headers.set(requestIdHeader, requestId);
  return decorateResponse(response, requestId, token);
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
