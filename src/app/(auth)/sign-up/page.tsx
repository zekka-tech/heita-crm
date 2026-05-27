import type { Metadata } from "next";

import { PhoneOtpAuthForm } from "@/components/auth/phone-otp-auth-form";
import { turnstileSiteKey } from "@/lib/turnstile";

export const metadata: Metadata = {
  title: "Create account",
  description: "Join Heita — loyalty rewards and messaging for South African retailers.",
  robots: { index: false }
};

export default function SignUpPage() {
  return (
    <PhoneOtpAuthForm
      mode="sign-up"
      googleEnabled={Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)}
      appleEnabled={Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET)}
      turnstileSiteKey={turnstileSiteKey()}
    />
  );
}
