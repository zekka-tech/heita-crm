import type { Metadata } from "next";

import { PhoneOtpAuthForm } from "@/components/auth/phone-otp-auth-form";
import { turnstileSiteKey } from "@/lib/turnstile";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Heita account.",
  robots: { index: false }
};

type SignInPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolved = searchParams ? await searchParams : {};
  return (
    <PhoneOtpAuthForm
      mode="sign-in"
      googleEnabled={Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)}
      appleEnabled={Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET)}
      turnstileSiteKey={turnstileSiteKey()}
      oauthError={resolved.error ?? null}
    />
  );
}
