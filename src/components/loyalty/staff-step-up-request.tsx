"use client";

import { useState, useTransition } from "react";

import { Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appendCsrfHeader } from "@/lib/csrf";
import { useCsrfToken } from "@/hooks/use-csrf-token";

type Props = {
  businessId: string;
};

export function StaffStepUpRequest({ businessId }: Props) {
  const csrfToken = useCsrfToken();
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [isRequesting, startRequestTransition] = useTransition();
  const [isVerifying, startVerifyTransition] = useTransition();

  const requestOtp = () => {
    setStatus(null);
    setDevCode(null);
    startRequestTransition(() => {
      void fetch("/api/auth/request-staff-otp", {
        method: "POST",
        headers: appendCsrfHeader({ "Content-Type": "application/json" }, csrfToken),
        body: JSON.stringify({ businessId })
      })
        .then(async (res) => {
          const payload = (await res.json()) as { ok?: boolean; devCode?: string; error?: string };
          if (!res.ok) {
            setStatus({ kind: "error", text: payload.error ?? "Failed to send code." });
            return;
          }
          setStatus({ kind: "info", text: "Verification code sent." });
          setDevCode(payload.devCode ?? null);
          setStep("verify");
        })
        .catch(() => setStatus({ kind: "error", text: "Failed to send code. Please try again." }));
    });
  };

  const verifyOtp = () => {
    setStatus(null);
    startVerifyTransition(() => {
      void fetch("/api/auth/verify-staff-otp", {
        method: "POST",
        headers: appendCsrfHeader({ "Content-Type": "application/json" }, csrfToken),
        body: JSON.stringify({ businessId, code })
      })
        .then(async (res) => {
          const payload = (await res.json()) as { ok?: boolean; error?: string };
          if (!res.ok || !payload.ok) {
            setStatus({ kind: "error", text: "Verification failed. Request a new code and try again." });
            setStep("request");
            return;
          }
          // Reload so the Server Component re-checks hasFreshStaffStepUp.
          window.location.reload();
        })
        .catch(() => setStatus({ kind: "error", text: "Verification failed. Please try again." }));
    });
  };

  return (
    <div className="grid gap-3">
      {step === "request" ? (
        <Button variant="secondary" onClick={requestOtp} disabled={isRequesting}>
          {isRequesting ? "Sending…" : "Send staff OTP"}
        </Button>
      ) : (
        <>
          <Input
            label="Verification code"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            autoComplete="one-time-code"
            required
          />
          <Button variant="primary" onClick={verifyOtp} disabled={isVerifying || code.length !== 6}>
            {isVerifying ? "Verifying…" : "Verify staff access"}
          </Button>
        </>
      )}
      {status ? (
        <p className={`text-sm ${status.kind === "error" ? "text-danger" : "text-ink-muted"}`}>
          {status.text}
        </p>
      ) : null}
      {devCode ? (
        <Chip variant="warning" size="sm" className="self-start">
          Dev OTP: {devCode}
        </Chip>
      ) : null}
    </div>
  );
}
