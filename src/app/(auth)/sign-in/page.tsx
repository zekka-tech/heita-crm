import type { Metadata } from "next";

import {
  devBypassSignInAction,
  devSignOutAndResetAction
} from "@/app/(auth)/sign-in/actions";
import { PhoneOtpAuthForm } from "@/components/auth/phone-otp-auth-form";
import { CsrfField } from "@/components/security/csrf-field";
import { Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { turnstileSiteKey } from "@/lib/turnstile";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Heita account.",
  robots: { index: false }
};

type SignInPageProps = {
  searchParams?: Promise<{ error?: string; devReset?: string; devError?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolved = searchParams ? await searchParams : {};
  const devBypassEnabled = process.env.NODE_ENV !== "production";
  const devResetDone = resolved.devReset === "1";
  const devDbUnavailable = resolved.devError === "db-unavailable";

  return (
    <div className="grid w-full max-w-md gap-4">
      <PhoneOtpAuthForm
        mode="sign-in"
        googleEnabled={Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)}
        appleEnabled={Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET)}
        turnstileSiteKey={turnstileSiteKey()}
        oauthError={resolved.error ?? null}
      />

      {devBypassEnabled ? (
        <Card variant="outline" className="grid gap-3">
          <div className="space-y-1">
            <Chip variant="primary" size="sm">
              Development only
            </Chip>
            <p className="text-sm text-ink-muted">
              Bypass OTP and sign in as a seeded test user.
            </p>
            {devResetDone ? (
              <p className="text-xs text-ink-subtle">
                Dev test data has been reset.
              </p>
            ) : null}
            {devDbUnavailable ? (
              <p className="text-xs text-danger">
                Dev auth is unavailable because the database is offline. Start Postgres on
                localhost:5432 and Redis on localhost:6380, then retry.
              </p>
            ) : null}
          </div>

          <form action={devBypassSignInAction} className="grid gap-2">
            <CsrfField />
            <Button type="submit" variant="secondary" className="w-full">
              Dev sign in
            </Button>
          </form>

          <form action={devSignOutAndResetAction}>
            <CsrfField />
            <Button type="submit" variant="ghost" className="w-full">
              Sign out + reset dev data
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
