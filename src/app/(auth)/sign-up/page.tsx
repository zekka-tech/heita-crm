import type { Metadata } from "next";

import { PhoneOtpAuthForm } from "@/components/auth/phone-otp-auth-form";
import { readCsrfCookie } from "@/lib/csrf";
import { turnstileSiteKey } from "@/lib/turnstile";

export const metadata: Metadata = {
  title: "Create account",
  description: "Join Heita — loyalty rewards and messaging for South African retailers.",
  robots: { index: false }
};

export default async function SignUpPage() {
  const csrfToken = await readCsrfCookie();
  return (
    <PhoneOtpAuthForm
      mode="sign-up"
      googleEnabled={Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)}
      appleEnabled={Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET)}
      turnstileSiteKey={turnstileSiteKey()}
      serverCsrfToken={csrfToken}
    />
  );
}
