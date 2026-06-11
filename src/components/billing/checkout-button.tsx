"use client";

import { useState } from "react";
import type { PaymentProvider } from "@prisma/client";
import { CreditCard, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { appendCsrfHeader } from "@/lib/csrf";
import { useCsrfToken } from "@/hooks/use-csrf-token";
import type { ConfiguredPaymentProvider } from "@/server/services/payments/types";

type CheckoutResult =
  | { kind: "redirect"; url: string; checkoutId?: string }
  | { kind: "form_post"; url: string; fields: Record<string, string> };

type Props = {
  businessId: string;
  planId: string;
  label: string;
  providers: ConfiguredPaymentProvider[];
};

function submitFormPost(
  result: Extract<CheckoutResult, { kind: "form_post" }>,
) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = result.url;
  form.style.display = "none";

  for (const [name, value] of Object.entries(result.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

export function CheckoutButton({
  businessId,
  planId,
  label,
  providers,
}: Props) {
  const csrfToken = useCsrfToken();
  const [loadingProvider, setLoadingProvider] =
    useState<PaymentProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade(provider: PaymentProvider) {
    setLoadingProvider(provider);
    setError(null);
    try {
      const resp = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: appendCsrfHeader(
          { "Content-Type": "application/json" },
          csrfToken,
        ),
        body: JSON.stringify({ businessId, planId, provider }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Checkout failed.",
        );
      }

      const result = (await resp.json()) as CheckoutResult;
      if (result.kind === "redirect") {
        window.location.href = result.url;
        return;
      }

      submitFormPost(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to start checkout.",
      );
      setLoadingProvider(null);
    }
  }

  if (providers.length === 0) {
    return (
      <p className="text-xs text-ink-muted">
        Checkout is temporarily unavailable. Contact support to upgrade.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {providers.map((provider) => {
          const loading = loadingProvider === provider.id;
          return (
            <Button
              key={provider.id}
              variant="gradient"
              className="w-full"
              onClick={() => void handleUpgrade(provider.id)}
              disabled={loadingProvider !== null || !csrfToken}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              {loading
                ? `Opening ${provider.label}…`
                : `${label} with ${provider.label}`}
            </Button>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
