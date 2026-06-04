import { type NextRequest, NextResponse } from "next/server";

import { StaffRole } from "@prisma/client";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { e2eDevOtpEnabled } from "@/lib/e2e";
import { requireRole } from "@/lib/staff";
import { requestStaffStepUpOtp } from "@/lib/staff-step-up";
import { sendOtpSms } from "@/lib/sms";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await auth();
  if (!session?.user?.id || !session.user.phone) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let businessId: string;
  try {
    const body = (await request.json()) as { businessId?: string };
    businessId = String(body.businessId ?? "").trim();
    if (!businessId) throw new Error("missing businessId");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    await requireRole({
      businessId,
      userId: session.user.id,
      allowedRoles: [StaffRole.STAFF, StaffRole.AI_TRAINER]
    });
  } catch {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { code } = await requestStaffStepUpOtp({
    phone: session.user.phone,
    userId: session.user.id,
    businessId
  });

  await sendOtpSms({ to: session.user.phone, code });

  return NextResponse.json({
    ok: true,
    devCode: e2eDevOtpEnabled() ? code : undefined
  });
}
