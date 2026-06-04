import { type NextRequest, NextResponse } from "next/server";

import { StaffRole } from "@prisma/client";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { requireRole } from "@/lib/staff";
import { verifyStaffStepUpOtp } from "@/lib/staff-step-up";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await auth();
  if (!session?.user?.id || !session.user.phone) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let businessId: string;
  let code: string;
  try {
    const body = (await request.json()) as { businessId?: string; code?: string };
    businessId = String(body.businessId ?? "").trim();
    code = String(body.code ?? "").trim();
    if (!businessId || !code) throw new Error("missing fields");
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

  const verified = await verifyStaffStepUpOtp({
    userId: session.user.id,
    businessId,
    phone: session.user.phone,
    code
  });

  return NextResponse.json({ ok: verified });
}
