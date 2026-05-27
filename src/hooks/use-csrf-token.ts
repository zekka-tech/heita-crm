"use client";

import { useEffect, useState } from "react";

import { CSRF_COOKIE, isValidCsrfToken } from "@/lib/csrf";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&") + "=([^;]*)")
  );
  if (!match) return null;
  return decodeURIComponent(match[1] ?? "");
}

/**
 * Read the double-submit CSRF token issued by middleware. Returns null until
 * the cookie is observable, so callers should disable mutating buttons while
 * the value is still loading.
 */
export function useCsrfToken(): string | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const value = readCookie(CSRF_COOKIE);
    if (isValidCsrfToken(value)) {
      setToken(value);
    }
  }, []);

  return token;
}
