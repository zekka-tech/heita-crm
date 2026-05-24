// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileSettings } from "@/components/account/profile-settings";
import { generateCsrfToken, CSRF_COOKIE } from "@/lib/csrf";

const messages = {
  profileSettings: {
    title: "Profile settings",
    fullName: "Full name",
    email: "Email",
    preferredAiMode: "Preferred AI mode",
    modeAuto: "Auto",
    modeLocal: "Local",
    modeCloud: "Cloud",
    saveChanges: "Save changes",
    downloadData: "Download my data",
    deleteAccount: "Delete account",
    updated: "Profile updated.",
    updateError: "Unable to update profile.",
    deleteError: "Unable to delete account.",
    confirmDelete: "Delete this account?"
  }
};

describe("ProfileSettings", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    document.cookie = `${CSRF_COOKIE}=${generateCsrfToken()}; path=/`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("announces successful mutations through a live region", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    render(
      <NextIntlClientProvider locale="en-ZA" messages={messages}>
        <ProfileSettings
          initialName="Wave Tester"
          initialEmail="tester@example.com"
          initialPreferredAiMode="auto"
        />
      </NextIntlClientProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      const status = screen.getByText("Profile updated.");
      expect(status.getAttribute("role")).toBe("status");
      expect(status.getAttribute("aria-live")).toBe("polite");
    });
  });
});
