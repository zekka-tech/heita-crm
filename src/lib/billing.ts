export type BusinessPlanId = "FREE" | "GROWTH" | "SCALE";

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
      "5 staff seats",
      "WhatsApp templates and automations",
      "Sales document follow-ups",
      "5,000 AI replies per month"
    ],
    limits: {
      members: 10_000,
      staffSeats: 5,
      aiMessagesPerMonth: 5_000,
      documentUploadsPerMonth: 50
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
      "Unlimited members",
      "Unlimited staff seats",
      "Priority onboarding",
      "Advanced sales document follow-ups",
      "Unlimited AI replies and document ingestion"
    ],
    limits: {
      members: null,
      staffSeats: null,
      aiMessagesPerMonth: null,
      documentUploadsPerMonth: null
    }
  }
];

const FREE_PLAN = businessPlans.find((plan) => plan.id === "FREE") as BusinessPlan;

export function getBusinessPlan(planId: BusinessPlanId): BusinessPlan {
  return businessPlans.find((plan) => plan.id === planId) ?? FREE_PLAN;
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
