import { OtpPurpose } from "@prisma/client";

export const authOtpModes = ["sign-in", "sign-up"] as const;

export type AuthOtpMode = (typeof authOtpModes)[number];

export function isAuthOtpMode(value: string): value is AuthOtpMode {
  return authOtpModes.includes(value as AuthOtpMode);
}

export function getOtpPurposeForMode(mode: AuthOtpMode): OtpPurpose {
  return mode === "sign-up" ? OtpPurpose.SIGN_UP : OtpPurpose.SIGN_IN;
}
