// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationPreferencesCard } from "@/components/account/notification-preferences-card";

vi.mock("@/hooks/use-csrf-token", () => ({ useCsrfToken: () => "test-csrf-token-valid-32chars-xx" }));

const messages = {
  notificationPreferences: {
    title: "Notification preferences",
    description: "Choose channels.",
    businessHint: "Applies to this business only.",
    emptyState: "Nothing here yet.",
    saveChanges: "Save notification preferences",
    updated: "Notification preferences updated.",
    updateError: "Unable to update notification preferences.",
    channels: {
      inApp: "In-app feed",
      push: "Browser push",
      email: "Email"
    },
    quietHours: {
      enabled: "Pause push and email during quiet hours",
      start: "Quiet hours start",
      end: "Quiet hours end",
      timezone: "Quiet hours use {timezone}."
    }
  }
};

describe("NotificationPreferencesCard", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("saves per-business channel and quiet-hour preferences", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        user: {
          notificationPreferences: {
            version: 1,
            businesses: {
              biz_1: {
                channels: {
                  inApp: true,
                  push: false,
                  email: true
                },
                quietHours: {
                  enabled: true,
                  start: "21:00",
                  end: "06:00",
                  timezone: "Africa/Johannesburg"
                }
              }
            }
          }
        }
      })
    });

    render(
      <NextIntlClientProvider locale="en-ZA" messages={messages}>
        <NotificationPreferencesCard
          businesses={[{ id: "biz_1", name: "Acme Retail" }]}
          initialPreferences={{ version: 1, businesses: {} }}
        />
      </NextIntlClientProvider>
    );

    fireEvent.click(screen.getByLabelText("Browser push"));
    fireEvent.click(screen.getByLabelText("Pause push and email during quiet hours"));
    fireEvent.change(screen.getByLabelText("Quiet hours start"), {
      target: { value: "21:00" }
    });
    fireEvent.change(screen.getByLabelText("Quiet hours end"), {
      target: { value: "06:00" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save notification preferences/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(String(options.body))).toEqual({
      notificationPreferences: {
        version: 1,
        businesses: {
          biz_1: {
            channels: {
              inApp: true,
              push: false,
              email: true
            },
            quietHours: {
              enabled: true,
              start: "21:00",
              end: "06:00",
              timezone: "Africa/Johannesburg"
            }
          }
        }
      }
    });

    await waitFor(() => {
      expect(screen.getByText("Notification preferences updated.")).toBeTruthy();
    });
  });
});
