"use client";

import { useEffect, useState } from "react";

import { CSRF_COOKIE, isValidCsrfToken } from "@/lib/csrf";

const COOKIE_POLL_INTERVAL_MS = 100;
const COOKIE_POLL_TIMEOUT_MS = 5_000;

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
  const [token, setToken] = useState<string | null>(() => {
    const value = readCookie(CSRF_COOKIE);
    return isValidCsrfToken(value) ? value : null;
  });

  useEffect(() => {
    if (token) return;

    const startedAt = Date.now();
    const syncFromCookie = () => {
      const value = readCookie(CSRF_COOKIE);
      if (!isValidCsrfToken(value)) {
        return false;
      }
      setToken((current) => current ?? value);
      return true;
    };

    if (syncFromCookie()) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const expired = Date.now() - startedAt >= COOKIE_POLL_TIMEOUT_MS;
      if (syncFromCookie() || expired) {
        window.clearInterval(intervalId);
      }
    }, COOKIE_POLL_INTERVAL_MS);

    const onWindowFocus = () => {
      syncFromCookie();
    };

    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onWindowFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onWindowFocus);
    };
  }, [token]);

  return token;
}
