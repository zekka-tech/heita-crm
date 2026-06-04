"use client";

import { useCallback, useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, ShieldCheck, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useCsrfToken } from "@/hooks/use-csrf-token";
import { appendCsrfHeader } from "@/lib/csrf";

type PhoneOtpAuthFormProps = {
  mode: "sign-in" | "sign-up";
  googleEnabled: boolean;
  appleEnabled: boolean;
  turnstileSiteKey: string | null;
  oauthError?: string | null;
  /** Pre-fetched token from the Server Component; removes dependency on document.cookie polling. */
  serverCsrfToken?: string | null;
};

const OAUTH_ERROR_KEYS: Record<string, string> = {
  OAuthEmailMissing: "errorOAuthEmailMissing",
  AccountDeactivated: "errorAccountDeactivated",
  OAuthAccountLinkRequired: "errorOAuthAccountLinkRequired"
};

const OAUTH_ERROR_FALLBACKS: Record<string, string> = {
  OAuthEmailMissing:
    "Your Google or Apple account did not share an email address. Sign in with your phone number instead.",
  AccountDeactivated:
    "This account has been deactivated. Contact support@heita.co.za if you believe this is a mistake.",
  OAuthAccountLinkRequired:
    "An account already exists with this email. Sign in with your phone first, then link Google or Apple from your profile."
};

export function PhoneOtpAuthForm({
  mode,
  googleEnabled,
  appleEnabled,
  turnstileSiteKey,
  oauthError,
  serverCsrfToken
}: PhoneOtpAuthFormProps) {
  const t = useTranslations("auth");
  const csrfToken = useCsrfToken(serverCsrfToken);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") ?? "/home";

  const resolveOauthError = () => {
    if (!oauthError) return null;
    const key = OAUTH_ERROR_KEYS[oauthError];
    const fallback = OAUTH_ERROR_FALLBACKS[oauthError];
    if (!fallback) return null;
    // useTranslations throws on missing keys, so guard with a fallback string.
    try {
      return key ? t(key) : fallback;
    } catch {
      return fallback;
    }
  };

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(
    (() => {
      const message = resolveOauthError();
      return message ? { kind: "error" as const, text: message } : null;
    })()
  );
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isRequesting, startRequestTransition] = useTransition();
  const [isSubmitting, startSubmitTransition] = useTransition();

  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token || null);
  }, []);

  const requestOtp = () => {
    setStatus(null);
    setDevCode(null);

    startRequestTransition(() => {
      void fetch("/api/auth/request-otp", {
        method: "POST",
        headers: appendCsrfHeader({ "Content-Type": "application/json" }, csrfToken),
        body: JSON.stringify({ phone, mode, turnstileToken })
      })
        .then(async (response) => {
          const payload = (await response.json()) as {
            ok?: boolean;
            code?: string;
            message?: string;
            devCode?: string;
            error?: string;
          };

          if (!response.ok) {
            const msg =
              payload.code === "rate_limited"
                ? (payload.error ?? "Too many attempts. Please wait before trying again.")
                : (payload.error ?? "Unable to send verification code.");
            throw new Error(msg);
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
        mode,
        acceptTerms: acceptTerms ? "true" : "false",
        redirect: false,
        redirectTo: callbackUrl
      }).then((result) => {
        if (!result?.ok || result.error) {
          const errorText =
            result?.error === "CredentialsSignin"
              ? "Incorrect or expired code. Check the code and try again, or request a new one."
              : "Verification failed. Request a new code and try again.";
          setStatus({ kind: "error", text: errorText });
          return;
        }

        window.location.href = result.url ?? callbackUrl;
      });
    });
  };

  const turnstileRequired = Boolean(turnstileSiteKey);
  const turnstileReady = turnstileRequired ? Boolean(turnstileToken) : true;

  return (
    <Card variant="surface" className="grid w-full max-w-md gap-6">
      <header className="space-y-3">
        <Chip variant="primary" size="sm">
          {mode === "sign-in" ? "Welcome back" : "Create your account"}
        </Chip>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {mode === "sign-in" ? t("signInTitle") : t("signUpTitle")}
        </h1>
        <p className="text-sm leading-6 text-ink-muted">
          {mode === "sign-in" ? t("signInBlurb") : t("signUpBlurb")}{" "}
          {t("providerSuffix")}
        </p>
      </header>

      <div className="grid gap-2">
        {googleEnabled ? (
          <Button
            variant="secondary"
            type="button"
            onClick={() => void signIn("google", { redirectTo: callbackUrl })}
          >
            {t("continueGoogle")}
          </Button>
        ) : null}
        {appleEnabled ? (
          <Button
            variant="secondary"
            type="button"
            onClick={() => void signIn("apple", { redirectTo: callbackUrl })}
          >
            {t("continueApple")}
          </Button>
        ) : null}
      </div>

      {(googleEnabled || appleEnabled) && (
        <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-ink-subtle">
          <span className="h-px flex-1 bg-line" />
          {t("dividerOrPhone")}
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
          label={t("phoneLabel")}
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder={t("phonePlaceholder")}
          autoComplete="tel"
          required
          disabled={step === "code"}
        />

        {step === "code" ? (
          <Input
            label={t("codeLabel")}
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

        {mode === "sign-up" ? (
          <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-elevated px-3 py-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(event) => setAcceptTerms(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-line"
              required
            />
            <span>
              I agree to the{" "}
              <a href="/terms" className="text-primary-action underline">
                Terms
              </a>{" "}
              and{" "}
              <a href="/privacy" className="text-primary-action underline">
                Privacy Policy
              </a>
              .
            </span>
          </label>
        ) : null}

        {step === "phone" && turnstileSiteKey ? (
          <TurnstileWidget
            siteKey={turnstileSiteKey}
            action={mode}
            onToken={handleTurnstileToken}
            className="mx-auto"
          />
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={
            step === "phone"
              ? !phone || isRequesting || !turnstileReady
              || !csrfToken
              : code.length !== 6 || isSubmitting || (mode === "sign-up" && !acceptTerms)
          }
        >
          {step === "phone" ? (
            isRequesting ? (
              t("sending")
            ) : (
              <>
                {t("sendCode")}
                <ArrowRight className="h-4 w-4" />
              </>
            )
          ) : isSubmitting ? (
            t("verifying")
          ) : mode === "sign-in" ? (
            t("verifySignIn")
          ) : (
            t("verifyCreate")
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
              setTurnstileToken(null);
            }}
          >
            {t("useDifferentNumber")}
          </button>
        ) : null}
      </form>

      {status ? (
        <p
          aria-live="polite"
          role={status.kind === "error" ? "alert" : "status"}
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
        {t("footerSecurity")}
        <span className="ml-auto inline-flex items-center gap-1">
          <Smartphone className="h-3 w-3" /> {t("footerRegion")}
        </span>
      </footer>
    </Card>
  );
}
