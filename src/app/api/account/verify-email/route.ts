import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { confirmEmailChange } from "@/server/services/account.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/verify-email?userId=...&email=...&exp=...&token=...
 * Confirms a pending email-change request and redirects back to the profile page.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const userId = searchParams.get("userId");
  const email = searchParams.get("email");
  const expRaw = searchParams.get("exp");
  const token = searchParams.get("token");

  if (!userId || !email || !expRaw || !token) {
    return NextResponse.json({ error: "Invalid verification link." }, { status: 400 });
  }

  const exp = Number(expRaw);
  if (!Number.isFinite(exp)) {
    return NextResponse.json({ error: "Invalid verification link." }, { status: 400 });
  }

  try {
    await confirmEmailChange(userId, email, exp, token);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return NextResponse.redirect(new URL("/profile?flash=email_verified", appUrl || request.nextUrl));
  } catch (err) {
    logger.warn({ err, userId }, "account.email.verify.failed");
    return NextResponse.json(
      { error: "Verification failed." },
      { status: 400 }
    );
  }
}
