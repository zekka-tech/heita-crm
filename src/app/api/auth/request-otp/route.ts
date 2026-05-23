import { OtpPurpose } from "@prisma/client";
import { NextResponse } from "next/server";

import { issueOtpCode } from "@/lib/otp";
import { sendOtpSms } from "@/lib/sms";

export async function POST(request: Request) {
  const body = (await request.json()) as { phone?: string };
  const phone = String(body.phone ?? "").trim();

  if (phone.length < 10 || phone.length > 20) {
    return NextResponse.json(
      {
        error: "Enter a valid phone number."
      },
      { status: 400 }
    );
  }

  const { code, expiresAt } = await issueOtpCode({
    phone,
    purpose: OtpPurpose.SIGN_IN
  });

  await sendOtpSms({
    to: phone,
    code
  });

  return NextResponse.json({
    ok: true,
    message: `OTP issued. It expires at ${expiresAt.toISOString()}.`,
    devCode: process.env.NODE_ENV !== "production" ? code : undefined
  });
}
