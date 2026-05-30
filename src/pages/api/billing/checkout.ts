import type { NextApiRequest, NextApiResponse } from "next";
import type { BusinessPlanId } from "@prisma/client";

import { verifyCsrfNextApiRequest } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { authenticateRequestUser } from "@/lib/request-auth";
import { requireRole } from "@/lib/staff";
import { createYocoCheckoutSession } from "@/server/services/billing.service";

const VALID_PLANS: BusinessPlanId[] = ["GROWTH", "SCALE"];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!verifyCsrfNextApiRequest(req)) {
    return res.status(403).json({ error: "CSRF validation failed." });
  }

  const session = await authenticateRequestUser(req.headers);
  if (!session?.userId) {
    return res.status(401).json({ error: "Unauthenticated." });
  }

  const { businessId, planId } = req.body as {
    businessId?: string;
    planId?: BusinessPlanId;
  };

  if (!businessId || !planId || !VALID_PLANS.includes(planId)) {
    return res.status(400).json({ error: "businessId and a paid planId are required." });
  }

  try {
    await requireRole({ businessId, userId: session.userId, allowedRoles: ["OWNER"] });
  } catch {
    return res.status(403).json({ error: "Only the business owner may change the plan." });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const returnUrl = `${appUrl}/dashboard/${businessId}/settings/billing`;

  try {
    const result = await createYocoCheckoutSession(businessId, planId, returnUrl);
    return res.status(200).json(result);
  } catch (err) {
    logger.error({ err, businessId, planId }, "billing.checkout.error");
    return res.status(502).json({ error: "Unable to create checkout session." });
  }
}
