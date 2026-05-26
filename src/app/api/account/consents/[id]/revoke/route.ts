import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConsentType } from "@prisma/client";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) {
    return csrfFailure as NextResponse;
  }

  const { id } = await params;

  const consent = await prisma.userConsent.findUnique({
    where: { id },
    select: { id: true, userId: true, type: true, businessId: true, revokedAt: true }
  });

  if (!consent) {
    return NextResponse.json({ error: "Consent record not found." }, { status: 404 });
  }

  if (consent.userId !== userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (consent.revokedAt !== null) {
    return NextResponse.json({ error: "Consent has already been revoked." }, { status: 409 });
  }

  const revokedAt = new Date();

  await prisma.userConsent.update({
    where: { id },
    data: { revokedAt }
  });

  logger.info({ userId, consentId: id, type: consent.type }, "account.consent.revoked");

  // For WhatsApp marketing consent, also update the membership's marketing
  // opt-in flag if the Membership model carries one.
  // The current schema does not have a marketingConsent column on Membership,
  // so we log the intent and do nothing further here. When the schema adds
  // that field a migration and the line below should be uncommented:
  //
  // if (consent.type === ConsentType.WHATSAPP_MARKETING && consent.businessId) {
  //   await prisma.membership.updateMany({
  //     where: { userId, businessId: consent.businessId },
  //     data: { marketingConsent: false }
  //   });
  // }
  void ConsentType; // keep import alive until schema extends Membership

  return NextResponse.json({ ok: true });
}
