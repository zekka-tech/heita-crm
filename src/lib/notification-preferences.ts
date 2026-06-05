import { z } from "zod";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DEFAULT_TIMEZONE = "Africa/Johannesburg";

type NotificationChannelPreferenceShape = {
  inApp: boolean;
  push: boolean;
  email: boolean;
  whatsapp: boolean;
};

type NotificationQuietHoursShape = {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
};

const DEFAULT_CHANNEL_PREFERENCES = {
  inApp: true,
  push: true,
  email: true,
  // WhatsApp is opt-in: proactive sends are billable and require an active
  // WHATSAPP_MARKETING consent, so customers must explicitly enable it.
  whatsapp: false
} satisfies NotificationChannelPreferenceShape;

const DEFAULT_QUIET_HOURS = {
  enabled: false,
  start: "22:00",
  end: "07:00",
  timezone: DEFAULT_TIMEZONE
} satisfies NotificationQuietHoursShape;

const ChannelPreferencesSchema = z.object({
  inApp: z.boolean(),
  push: z.boolean(),
  email: z.boolean(),
  whatsapp: z.boolean()
});

const QuietHoursSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(TIME_PATTERN),
  end: z.string().regex(TIME_PATTERN),
  timezone: z.string().min(1)
});

const BusinessNotificationPreferenceSchema = z.object({
  channels: ChannelPreferencesSchema,
  quietHours: QuietHoursSchema
});

const RawNotificationPreferencesSchema = z.object({
  version: z.literal(1).default(1),
  businesses: z.record(z.string(), z.unknown()).default({})
});

export const NotificationPreferencesSchema = RawNotificationPreferencesSchema.transform(
  (value) => ({
    version: 1 as const,
    businesses: Object.fromEntries(
      Object.entries(value.businesses).map(([businessId, preference]) => [
        businessId,
        normalizeBusinessNotificationPreference(preference)
      ])
    )
  })
);

export type NotificationChannelPreference = z.infer<typeof ChannelPreferencesSchema>;
export type NotificationQuietHours = z.infer<typeof QuietHoursSchema>;
export type BusinessNotificationPreference = z.infer<
  typeof BusinessNotificationPreferenceSchema
>;
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;
export type NotificationDeliveryChannel = keyof NotificationChannelPreference;

export function normalizeNotificationPreferences(
  value: unknown
): NotificationPreferences {
  const parsed = RawNotificationPreferencesSchema.safeParse(value);
  if (!parsed.success) {
    return {
      version: 1,
      businesses: {}
    };
  }

  return {
    version: 1,
    businesses: Object.fromEntries(
      Object.entries(parsed.data.businesses).map(([businessId, preference]) => [
        businessId,
        normalizeBusinessNotificationPreference(preference)
      ])
    )
  };
}

export function defaultBusinessNotificationPreference(): BusinessNotificationPreference {
  return {
    channels: { ...DEFAULT_CHANNEL_PREFERENCES },
    quietHours: { ...DEFAULT_QUIET_HOURS }
  };
}

function normalizeBusinessNotificationPreference(
  value: unknown
): BusinessNotificationPreference {
  const source =
    typeof value === "object" && value !== null
      ? (value as {
          channels?: Partial<NotificationChannelPreferenceShape>;
          quietHours?: Partial<NotificationQuietHoursShape>;
        })
      : {};

  return BusinessNotificationPreferenceSchema.parse({
    channels: {
      ...DEFAULT_CHANNEL_PREFERENCES,
      ...(source.channels ?? {})
    },
    quietHours: {
      ...DEFAULT_QUIET_HOURS,
      ...(source.quietHours ?? {})
    }
  });
}

export function getBusinessNotificationPreference(
  preferences: NotificationPreferences,
  businessId: string | null | undefined
): BusinessNotificationPreference {
  if (!businessId) {
    return defaultBusinessNotificationPreference();
  }

  return normalizeBusinessNotificationPreference(preferences.businesses[businessId]);
}

function getMinutesInTimezone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function parseMinutes(raw: string) {
  const match = raw.match(TIME_PATTERN);
  if (!match) {
    return 0;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

export function isWithinQuietHours(input: {
  quietHours: NotificationQuietHours;
  now?: Date;
}) {
  const { quietHours } = input;
  if (!quietHours.enabled) {
    return false;
  }

  const startMinutes = parseMinutes(quietHours.start);
  const endMinutes = parseMinutes(quietHours.end);
  const currentMinutes = getMinutesInTimezone(
    input.now ?? new Date(),
    quietHours.timezone
  );

  if (startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

export function shouldDeliverNotificationChannel(input: {
  preferences: NotificationPreferences | unknown;
  businessId?: string | null;
  channel: NotificationDeliveryChannel;
  now?: Date;
}) {
  const normalized = normalizeNotificationPreferences(input.preferences);
  const preference = getBusinessNotificationPreference(normalized, input.businessId);

  if (!preference.channels[input.channel]) {
    return false;
  }

  if (
    input.channel !== "inApp" &&
    isWithinQuietHours({ quietHours: preference.quietHours, now: input.now })
  ) {
    return false;
  }

  return true;
}
