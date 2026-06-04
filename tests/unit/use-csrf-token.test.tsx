// @vitest-environment jsdom

import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateCsrfToken, CSRF_COOKIE } from "@/lib/csrf";
import { useCsrfToken } from "@/hooks/use-csrf-token";

function HookProbe() {
  const token = useCsrfToken();
  return <div data-testid="token">{token ?? "missing"}</div>;
}

describe("useCsrfToken", () => {
  let cookieJar = "";

  beforeEach(() => {
    vi.useFakeTimers();
    cookieJar = "";
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => cookieJar,
      set: (value: string) => {
        cookieJar = value;
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cookieJar = "";
  });

  it("picks up a CSRF cookie that appears after mount", async () => {
    const token = generateCsrfToken();

    render(<HookProbe />);
    expect(screen.getByTestId("token").textContent).toBe("missing");

    await act(async () => {
      document.cookie = `${CSRF_COOKIE}=${token}; path=/`;
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(screen.getByTestId("token").textContent).toBe(token);
  });
});
