import { NextResponse } from "next/server";
import NextAuth from "next-auth";

import { authBaseConfig } from "@/lib/auth.config";
import { requestIdHeader, resolveRequestId } from "@/lib/request-context";

const { auth } = NextAuth(authBaseConfig);

const protectedPrefixes = ["/home", "/wallet", "/notifications", "/profile", "/dashboard", "/onboard"];
const authPrefixes = ["/sign-in", "/sign-up"];

function withCorrelationId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set(requestIdHeader, requestId);
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

  if (!isAuthenticated && isProtectedRoute) {
    const signInUrl = new URL("/sign-in", request.nextUrl);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return withCorrelationId(NextResponse.redirect(signInUrl), requestId);
  }

  if (isAuthenticated && isAuthRoute) {
    return withCorrelationId(NextResponse.redirect(new URL("/home", request.nextUrl)), requestId);
  }

  const response = NextResponse.next();
  // Propagate the request ID to downstream handlers and back to clients.
  response.headers.set(requestIdHeader, requestId);
  request.headers.set(requestIdHeader, requestId);
  return response;
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
