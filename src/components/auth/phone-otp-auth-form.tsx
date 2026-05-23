"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";

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
  const [status, setStatus] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [isRequesting, startRequestTransition] = useTransition();
  const [isSubmitting, startSubmitTransition] = useTransition();

  return (
    <section className="surface w-full rounded-[2rem] p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#af5f33]">
        Authentication
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#143127]">
        {mode === "sign-in" ? "Sign in to Heita" : "Create your Heita account"}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#456356]">
        Use a phone OTP now. Google and Apple providers appear automatically when
        their environment variables are configured.
      </p>

      <div className="mt-6 grid gap-3">
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

      <form
        className="mt-8 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setStatus(null);
          setDevCode(null);

          startSubmitTransition(() => {
            void signIn("phone-otp", {
              phone,
              code,
              redirect: false,
              redirectTo: "/home"
            }).then((result) => {
              if (!result?.ok || result.error) {
                setStatus("OTP verification failed. Request a new code and try again.");
                return;
              }

              window.location.href = result.url ?? "/home";
            });
          });
        }}
      >
        <label className="grid gap-2 text-sm text-[#143127]">
          Phone number
          <input
            className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
            type="tel"
            name="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+27 82 000 0000"
            required
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => {
              setStatus(null);
              setDevCode(null);

              startRequestTransition(() => {
                void fetch("/api/auth/request-otp", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json"
                  },
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
                      throw new Error(payload.error ?? "Unable to send OTP");
                    }

                    setStatus(payload.message ?? "OTP sent.");
                    setDevCode(payload.devCode ?? null);
                  })
                  .catch((error: Error) => {
                    setStatus(error.message);
                  });
              });
            }}
            disabled={!phone || isRequesting}
          >
            {isRequesting ? "Sending..." : "Send OTP"}
          </Button>
        </div>

        <label className="grid gap-2 text-sm text-[#143127]">
          Verification code
          <input
            className="rounded-2xl border border-[rgba(20,49,39,0.14)] bg-white px-4 py-3 outline-none"
            type="text"
            inputMode="numeric"
            name="code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456"
            required
          />
        </label>

        <Button type="submit" disabled={!phone || !code || isSubmitting}>
          {isSubmitting
            ? "Verifying..."
            : mode === "sign-in"
              ? "Verify and sign in"
              : "Verify and create account"}
        </Button>
      </form>

      {status ? <p className="mt-4 text-sm text-[#456356]">{status}</p> : null}
      {devCode ? (
        <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-[#af5f33]">
          Dev OTP: {devCode}
        </p>
      ) : null}
    </section>
  );
}
