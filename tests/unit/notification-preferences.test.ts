import { describe, expect, it } from "vitest";

import {
  defaultBusinessNotificationPreference,
  normalizeNotificationPreferences,
  shouldDeliverNotificationChannel
} from "@/lib/notification-preferences";

describe("notification preferences", () => {
  it("falls back to defaults when preferences are missing or invalid", () => {
    expect(normalizeNotificationPreferences(null)).toEqual({
      version: 1,
      businesses: {}
    });

    expect(defaultBusinessNotificationPreference()).toEqual({
      channels: {
        inApp: true,
        push: true,
        email: true,
        whatsapp: false
      },
      quietHours: {
        enabled: false,
        start: "22:00",
        end: "07:00",
        timezone: "Africa/Johannesburg"
      }
    });
  });

  it("applies channel toggles per business", () => {
    const preferences = normalizeNotificationPreferences({
      version: 1,
      businesses: {
        biz_1: {
          channels: {
            inApp: true,
            push: false,
            email: true
          }
        }
      }
    });

    expect(
      shouldDeliverNotificationChannel({
        preferences,
        businessId: "biz_1",
        channel: "push"
      })
    ).toBe(false);
    expect(
      shouldDeliverNotificationChannel({
        preferences,
        businessId: "biz_1",
        channel: "email"
      })
    ).toBe(true);
  });

  it("suppresses push and email during quiet hours but keeps in-app enabled", () => {
    const preferences = normalizeNotificationPreferences({
      version: 1,
      businesses: {
        biz_1: {
          channels: {
            inApp: true,
            push: true,
            email: true
          },
          quietHours: {
            enabled: true,
            start: "22:00",
            end: "07:00",
            timezone: "Africa/Johannesburg"
          }
        }
      }
    });

    const duringQuietHours = new Date("2026-05-25T03:30:00+02:00");

    expect(
      shouldDeliverNotificationChannel({
        preferences,
        businessId: "biz_1",
        channel: "push",
        now: duringQuietHours
      })
    ).toBe(false);
    expect(
      shouldDeliverNotificationChannel({
        preferences,
        businessId: "biz_1",
        channel: "email",
        now: duringQuietHours
      })
    ).toBe(false);
    expect(
      shouldDeliverNotificationChannel({
        preferences,
        businessId: "biz_1",
        channel: "inApp",
        now: duringQuietHours
      })
    ).toBe(true);
  });
});
