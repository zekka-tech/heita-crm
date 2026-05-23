import { OtpPurpose } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getOtpPurposeForMode, isAuthOtpMode } from "@/lib/auth-intent";

describe("auth intent helpers", () => {
  it("maps sign-in to the sign-in OTP purpose", () => {
    expect(getOtpPurposeForMode("sign-in")).toBe(OtpPurpose.SIGN_IN);
  });

  it("maps sign-up to the sign-up OTP purpose", () => {
    expect(getOtpPurposeForMode("sign-up")).toBe(OtpPurpose.SIGN_UP);
  });

  it("recognises supported auth OTP modes", () => {
    expect(isAuthOtpMode("sign-in")).toBe(true);
    expect(isAuthOtpMode("sign-up")).toBe(true);
    expect(isAuthOtpMode("staff-step-up")).toBe(false);
  });
});
