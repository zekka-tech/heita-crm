export type BusinessPlanId = "FREE" | "STARTER" | "GROWTH" | "SCALE";

export type PlanQuota = {
  maxMembers: number | null;
  maxStaff: number | null;
  extraSeatPriceZar: number | null;
  maxAiMessagesPerMonth: number | null;
  maxWaTemplatesPerMonth: number | null;
  maxInAppMessagesPerMonth: number | null;
  aiOveragePriceZar: number;
};

export type BusinessPlan = {
  id: BusinessPlanId;
  name: string;
  monthlyPriceZar: number;
  annualPriceZar: number;
  description: string;
  ctaLabel: string;
  highlights: string[];
  limits: {
    members: number | null;
    staffSeats: number | null;
    aiMessagesPerMonth: number | null;
    documentUploadsPerMonth: number | null;
  };
  quota: PlanQuota;
};

export const businessPlans: BusinessPlan[] = [
  {
    id: "FREE",
    name: "Free",
    monthlyPriceZar: 0,
    annualPriceZar: 0,
    description: "For a single location validating loyalty demand without upfront spend.",
    ctaLabel: "Start free",
    highlights: [
      "Up to 500 members",
      "1 staff seat",
      "Basic QR joins and wallet",
      "200 AI replies per month"
    ],
    limits: {
      members: 500,
      staffSeats: 1,
      aiMessagesPerMonth: 200,
      documentUploadsPerMonth: 5
    },
    quota: {
      maxMembers: 500,
      maxStaff: 1,
      extraSeatPriceZar: null,
      maxAiMessagesPerMonth: 200,
      maxWaTemplatesPerMonth: null,
      maxInAppMessagesPerMonth: 200,
      aiOveragePriceZar: 0.20
    }
  },
  {
    id: "STARTER",
    name: "Starter",
    monthlyPriceZar: 499,
    annualPriceZar: 4990,
    description: "For growing stores ready to run loyalty campaigns and automate follow-ups.",
    ctaLabel: "Get started",
    highlights: [
      "Up to 3,000 members",
      "3 staff seats",
      "1,000 WhatsApp templates per month",
      "1,000 in-app messages per month",
      "1,500 AI replies per month"
    ],
    limits: {
      members: 3_000,
      staffSeats: 3,
      aiMessagesPerMonth: 1_500,
      documentUploadsPerMonth: 20
    },
    quota: {
      maxMembers: 3_000,
      maxStaff: 3,
      extraSeatPriceZar: null,
      maxAiMessagesPerMonth: 1_500,
      maxWaTemplatesPerMonth: 1_000,
      maxInAppMessagesPerMonth: 1_000,
      aiOveragePriceZar: 0.20
    }
  },
  {
    id: "GROWTH",
    name: "Growth",
    monthlyPriceZar: 1499,
    annualPriceZar: 14990,
    description: "For businesses running active campaigns, customer support, and AI assistance.",
    ctaLabel: "Talk to sales",
    highlights: [
      "Up to 10,000 members",
      "5 staff seats (+R149/extra seat)",
      "3,000 WhatsApp templates per month",
      "5,000 in-app messages per month",
      "5,000 AI replies per month"
    ],
    limits: {
      members: 10_000,
      staffSeats: 5,
      aiMessagesPerMonth: 5_000,
      documentUploadsPerMonth: 50
    },
    quota: {
      maxMembers: 10_000,
      maxStaff: 5,
      extraSeatPriceZar: 149,
      maxAiMessagesPerMonth: 5_000,
      maxWaTemplatesPerMonth: 3_000,
      maxInAppMessagesPerMonth: 5_000,
      aiOveragePriceZar: 0.20
    }
  },
  {
    id: "SCALE",
    name: "Scale",
    monthlyPriceZar: 4999,
    annualPriceZar: 49990,
    description: "For multi-branch operators needing deeper analytics, limits, and workflow control.",
    ctaLabel: "Book rollout",
    highlights: [
      "Up to 100,000 members (soft cap)",
      "25 staff seats (+R99/extra seat)",
      "20,000 WhatsApp templates per month",
      "25,000 in-app messages per month",
      "25,000 AI replies per month"
    ],
    // limits drives checkPlanLimit() enforcement; SCALE members is null (no
    // hard block) because the 100 000 in quota is a soft-cap for reporting only.
    limits: {
      members: null,
      staffSeats: 25,
      aiMessagesPerMonth: 25_000,
      documentUploadsPerMonth: null
    },
    quota: {
      maxMembers: 100_000,
      maxStaff: 25,
      extraSeatPriceZar: 99,
      maxAiMessagesPerMonth: 25_000,
      maxWaTemplatesPerMonth: 20_000,
      maxInAppMessagesPerMonth: 25_000,
      aiOveragePriceZar: 0.20
    }
  }
];

const FREE_PLAN = businessPlans.find((plan) => plan.id === "FREE") as BusinessPlan;

export function getBusinessPlan(planId: BusinessPlanId | string | null | undefined): BusinessPlan {
  return businessPlans.find((plan) => plan.id === planId) ?? FREE_PLAN;
}

export function getPlanQuota(planId: BusinessPlanId | string | null | undefined): PlanQuota {
  return getBusinessPlan(planId).quota;
}

export function formatZar(amount: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatPlanLimit(value: number | null, suffix: string) {
  if (value === null) {
    return `Unlimited ${suffix}`;
  }

  return `${new Intl.NumberFormat("en-ZA").format(value)} ${suffix}`;
}
