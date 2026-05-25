// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CookieConsentBanner } from "@/components/layout/cookie-consent-banner";
import {
  COOKIE_CONSENT_STORAGE_KEY,
  readCookieConsent
} from "@/lib/cookie-consent";

const messages = {
  cookieConsent: {
    title: "Cookie choices",
    body: "Choose whether we may use non-essential cookies.",
    learnMore: "Learn more about cookies",
    reject: "Reject non-essential",
    accept: "Accept non-essential"
  }
};

describe("CookieConsentBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.cookieConsent;
  });

  afterEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.cookieConsent;
  });

  it("renders until a choice is stored, then persists acceptance", async () => {
    render(
      <NextIntlClientProvider locale="en-ZA" messages={messages}>
        <CookieConsentBanner />
      </NextIntlClientProvider>
    );

    expect(await screen.findByText("Cookie choices")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /accept non-essential/i }));

    await waitFor(() => {
      expect(readCookieConsent()).toBe("accepted");
      expect(document.documentElement.dataset.cookieConsent).toBe("accepted");
    });

    expect(screen.queryByText("Cookie choices")).toBeNull();
    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe("accepted");
  });

  it("stays hidden when a consent choice already exists", async () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "rejected");

    render(
      <NextIntlClientProvider locale="en-ZA" messages={messages}>
        <CookieConsentBanner />
      </NextIntlClientProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText("Cookie choices")).toBeNull();
    });
  });
});
