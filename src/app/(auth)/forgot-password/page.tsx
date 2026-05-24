import Link from "next/link";
import { ShieldCheck, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = {
  title: "Recover access"
};

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-md">
      <Card variant="hero" className="px-6 py-7">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
          Authentication
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">
          Recover access with OTP
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/85">
          Heita does not use passwords for customer sign-in. Request a fresh
          one-time code on the sign-in screen and use it to regain access to
          your account.
        </p>
      </Card>

      <Card variant="surface" className="mt-4 space-y-4">
        <div className="rounded-2xl border border-line bg-surface-elevated p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary-action">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-ink">
                Use your verified phone number
              </h2>
              <p className="mt-1 text-sm leading-6 text-ink-muted">
                Enter the same mobile number you used to create your account.
                We will send a new six-digit code through the standard OTP
                delivery pipeline.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface-elevated p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-ink">
                No password reset link required
              </h2>
              <p className="mt-1 text-sm leading-6 text-ink-muted">
                This keeps recovery aligned with the same signed, rate-limited,
                phone-verification controls already used for authentication.
              </p>
            </div>
          </div>
        </div>

        <Button asChild variant="gradient" className="w-full">
          <Link href="/sign-in">Go to sign-in</Link>
        </Button>
      </Card>
    </div>
  );
}
