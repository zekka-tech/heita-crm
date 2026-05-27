import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Verify OTP",
  robots: { index: false }
};

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";

export default function VerifyOtpPage() {
  return (
    <Card variant="surface" className="w-full max-w-md space-y-4">
      <Chip variant="primary" size="sm">Authentication</Chip>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
        Verify phone OTP
      </h1>
      <p className="text-sm leading-6 text-ink-muted">
        OTP verification is handled directly from the sign-in and sign-up pages
        now. Use this fallback to restart the flow if you got stuck.
      </p>
      <Button asChild variant="primary">
        <Link href="/sign-in">Return to sign-in</Link>
      </Button>
    </Card>
  );
}
