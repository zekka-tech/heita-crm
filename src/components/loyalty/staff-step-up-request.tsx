"use client";

import { useState, useTransition } from "react";

import { Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appendCsrfHeader } from "@/lib/csrf";
import { useCsrfToken } from "@/hooks/use-csrf-token";

type Props = {
  businessId: string;
};

export function StaffStepUpRequest({ businessId }: Props) {
  const csrfToken = useCsrfToken();
  const [devCode, setDevCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const requestOtp = () => {
    setStatus(null);
    setDevCode(null);
    startTransition(() => {
      void fetch("/api/auth/request-staff-otp", {
        method: "POST",
        headers: appendCsrfHeader({ "Content-Type": "application/json" }, csrfToken),
        body: JSON.stringify({ businessId })
      })
        .then(async (res) => {
          const payload = (await res.json()) as { ok?: boolean; devCode?: string; error?: string };
          if (!res.ok) {
            setStatus(payload.error ?? "Failed to send code.");
            return;
          }
          setStatus("Verification code sent.");
          setDevCode(payload.devCode ?? null);
        })
        .catch(() => {
          setStatus("Failed to send code. Please try again.");
        });
    });
  };

  return (
    <div className="grid gap-3">
      <Button variant="secondary" onClick={requestOtp} disabled={isPending}>
        {isPending ? "Sending…" : "Send staff OTP"}
      </Button>
      {status ? (
        <p className="text-sm text-ink-muted">{status}</p>
      ) : null}
      {devCode ? (
        <Chip variant="warning" size="sm" className="self-start">
          Dev OTP: {devCode}
        </Chip>
      ) : null}
    </div>
  );
}
