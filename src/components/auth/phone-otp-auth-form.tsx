"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { ArrowRight, ShieldCheck, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type PhoneOtpAuthFormProps = {
  mode: "sign-in" | "sign-up";
  googleEnabled: boolean;
  appleEnabled: boolean;
};

export function PhoneOtpAuthForm({
  mode,
  googleEnabled,
  appleEnabled
}: PhoneOtpAuthFormProps) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(
    null
  );
  const [devCode, setDevCode] = useState<string | null>(null);
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [isRequesting, startRequestTransition] = useTransition();
  const [isSubmitting, startSubmitTransition] = useTransition();

  const requestOtp = () => {
    setStatus(null);
    setDevCode(null);

    startRequestTransition(() => {
      void fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone })
      })
        .then(async (response) => {
          const payload = (await response.json()) as {
            ok?: boolean;
            message?: string;
            devCode?: string;
            error?: string;
          };

          if (!response.ok) {
            throw new Error(payload.error ?? "Unable to send verification code.");
          }

          setStatus({ kind: "info", text: payload.message ?? "Code sent." });
          setDevCode(payload.devCode ?? null);
          setStep("code");
        })
        .catch((error: Error) => {
          setStatus({ kind: "error", text: error.message });
        });
    });
  };

  const submitCode = () => {
    setStatus(null);

    startSubmitTransition(() => {
      void signIn("phone-otp", {
        phone,
        code,
        redirect: false,
        redirectTo: "/home"
      }).then((result) => {
        if (!result?.ok || result.error) {
          setStatus({
            kind: "error",
            text: "Verification failed. Request a new code and try again."
          });
          return;
        }

        window.location.href = result.url ?? "/home";
      });
    });
  };

  return (
    <Card variant="surface" className="grid w-full max-w-md gap-6">
      <header className="space-y-3">
        <Chip variant="primary" size="sm">
          {mode === "sign-in" ? "Welcome back" : "Create your account"}
        </Chip>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {mode === "sign-in" ? "Sign in to Heita" : "Join Heita"}
        </h1>
        <p className="text-sm leading-6 text-ink-muted">
          We send a one-time code to your phone. Google and Apple sign-in appear
          automatically when configured.
        </p>
      </header>

      <div className="grid gap-2">
        {googleEnabled ? (
          <Button
            variant="secondary"
            type="button"
            onClick={() => void signIn("google", { redirectTo: "/home" })}
          >
            Continue with Google
          </Button>
        ) : null}
        {appleEnabled ? (
          <Button
            variant="secondary"
            type="button"
            onClick={() => void signIn("apple", { redirectTo: "/home" })}
          >
            Continue with Apple
          </Button>
        ) : null}
      </div>

      {(googleEnabled || appleEnabled) && (
        <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-ink-subtle">
          <span className="h-px flex-1 bg-line" />
          or via phone
          <span className="h-px flex-1 bg-line" />
        </div>
      )}

      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (step === "phone") {
            requestOtp();
            return;
          }

          submitCode();
        }}
      >
        <Input
          label="Phone number"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+27 82 000 0000"
          autoComplete="tel"
          required
          disabled={step === "code"}
        />

        {step === "code" ? (
          <Input
            label="6-digit verification code"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            autoComplete="one-time-code"
            required
          />
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={
            step === "phone"
              ? !phone || isRequesting
              : code.length !== 6 || isSubmitting
          }
        >
          {step === "phone" ? (
            isRequesting ? (
              "Sending code..."
            ) : (
              <>
                Send verification code
                <ArrowRight className="h-4 w-4" />
              </>
            )
          ) : isSubmitting ? (
            "Verifying..."
          ) : mode === "sign-in" ? (
            "Verify and sign in"
          ) : (
            "Verify and create account"
          )}
        </Button>

        {step === "code" ? (
          <button
            type="button"
            className="text-xs font-medium text-primary-action hover:underline self-start"
            onClick={() => {
              setStep("phone");
              setCode("");
              setStatus(null);
              setDevCode(null);
            }}
          >
            Use a different number
          </button>
        ) : null}
      </form>

      {status ? (
        <p
          className={
            status.kind === "error"
              ? "text-sm font-medium text-danger"
              : "text-sm text-ink-muted"
          }
        >
          {status.text}
        </p>
      ) : null}

      {devCode ? (
        <Chip variant="warning" size="sm" className="self-start">
          Dev OTP: {devCode}
        </Chip>
      ) : null}

      <footer className="flex items-center gap-2 text-xs text-ink-subtle">
        <ShieldCheck className="h-4 w-4 text-success" />
        Rate-limited · HMAC-signed · 10-minute expiry
        <span className="ml-auto inline-flex items-center gap-1">
          <Smartphone className="h-3 w-3" /> SA only
        </span>
      </footer>
    </Card>
  );
}
