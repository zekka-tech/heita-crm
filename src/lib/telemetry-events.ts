export const TELEMETRY_EVENTS = {
  onboardingPageViewed: "onboarding_page_viewed",
  onboardingStep: "onboarding_step",
  onboardingCompleted: "onboarding_completed",
  onboardingError: "onboarding_error",
  // Customer join→earn→redeem funnel (paid-CAC dashboard data contract)
  businessJoined: "business_joined",
  membershipJoined: "membership.joined",
  pointsEarned: "points_earned",
  loyaltyPointsEarned: "loyalty.points_earned",
  pointsRedeemed: "points_redeemed",
  loyaltyPointsRedeemed: "loyalty.points_redeemed",
  tierUpgraded: "tier_upgraded",
  // Subscription / billing funnel
  subscriptionStarted: "subscription_started",
  subscriptionUpgraded: "subscription_upgraded",
  // AI co-worker
  // "ai.message_sent" is the legacy event name emitted by src/app/api/ai/chat/route.ts.
  // "ai_message_sent" is the canonical taxonomy name for the paid-CAC dashboard contract.
  aiMessageSentLegacy: "ai.message_sent",
  aiMessageSent: "ai_message_sent",
  webVitals: "$web_vitals"
} as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENTS)[keyof typeof TELEMETRY_EVENTS];

type BaseBusinessProps = {
  businessId?: string;
};

export type TelemetryEventProperties = {
  [TELEMETRY_EVENTS.onboardingPageViewed]: Record<string, never>;
  [TELEMETRY_EVENTS.onboardingStep]: {
    step: string;
  } & Record<string, unknown>;
  [TELEMETRY_EVENTS.onboardingCompleted]: {
    businessName?: string;
    category?: string;
    province?: string;
    hasPhone: boolean;
    hasEmail: boolean;
  };
  [TELEMETRY_EVENTS.onboardingError]: {
    error: string;
  };
  [TELEMETRY_EVENTS.businessJoined]: BaseBusinessProps & {
    joinChannel: string;
    referralUsed: boolean;
    signupBonusPoints: number;
  };
  [TELEMETRY_EVENTS.membershipJoined]: BaseBusinessProps & {
    joinChannel: string;
    referralUsed: boolean;
    signupBonusPoints: number;
  };
  [TELEMETRY_EVENTS.pointsEarned]: BaseBusinessProps & {
    points: number;
  };
  [TELEMETRY_EVENTS.loyaltyPointsEarned]: BaseBusinessProps & {
    points: number;
  };
  [TELEMETRY_EVENTS.pointsRedeemed]: BaseBusinessProps & ({ rewardId: string } | { points: number });
  [TELEMETRY_EVENTS.loyaltyPointsRedeemed]: BaseBusinessProps & ({ rewardId: string } | { points: number });
  [TELEMETRY_EVENTS.tierUpgraded]: BaseBusinessProps & {
    previousTier: string;
    newTier: string;
  };
  [TELEMETRY_EVENTS.subscriptionStarted]: BaseBusinessProps & {
    plan: string;
    billingInterval: "monthly" | "annual";
  };
  [TELEMETRY_EVENTS.subscriptionUpgraded]: BaseBusinessProps & {
    previousPlan: string;
    newPlan: string;
    billingInterval: "monthly" | "annual";
  };
  [TELEMETRY_EVENTS.aiMessageSentLegacy]: BaseBusinessProps & {
    runtime: string;
    model?: string;
    citationCount: number;
    totalTokens?: number;
    grounded: boolean;
  };
  [TELEMETRY_EVENTS.aiMessageSent]: BaseBusinessProps & {
    runtime: string;
    model?: string;
    citationCount: number;
    totalTokens?: number;
    grounded: boolean;
  };
  [TELEMETRY_EVENTS.webVitals]: {
    metric_name: string;
    metric_value: number;
    metric_rating: string;
    metric_id: string;
    $current_url: string;
  };
};

export type TelemetryCaptureInput<EventName extends TelemetryEventName = TelemetryEventName> = {
  userId: string;
  event: EventName;
  properties?: TelemetryEventProperties[EventName];
};

const REDACTED_KEYS = new Set([
  "phone",
  "email",
  "token",
  "otp",
  "secret",
  "password",
  "auth",
  "key",
  "apikey",
  "$email",
  "$phone",
  "$name"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shouldRedactKey(key: string) {
  const normalised = key.toLowerCase().replace(/[^a-z0-9$]/g, "");
  return REDACTED_KEYS.has(normalised);
}

function shouldStripUrl(key: string) {
  const normalised = key.toLowerCase().replace(/[^a-z0-9$]/g, "");
  return normalised === "url" || normalised === "currenturl" || normalised === "$currenturl" || normalised.endsWith("url");
}

function stripUrlQuery(value: string) {
  try {
    const parsed = new URL(value);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value;
  }
}

export function scrubTelemetryProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (shouldRedactKey(key)) {
      out[key] = "[redacted]";
    } else if (typeof value === "string" && shouldStripUrl(key)) {
      out[key] = stripUrlQuery(value);
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) => isPlainObject(item) ? scrubTelemetryProperties(item) : item);
    } else if (isPlainObject(value)) {
      out[key] = scrubTelemetryProperties(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
