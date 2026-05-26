"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  businessId: string;
  planId: string;
  label: string;
};

export function CheckoutButton({ businessId, planId, label }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, planId })
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Checkout failed.");
      }

      const { redirectUrl } = (await resp.json()) as { redirectUrl: string };
      window.location.href = redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start checkout.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant="gradient"
        className="w-full"
        onClick={handleUpgrade}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CreditCard className="h-4 w-4" />
        )}
        {loading ? "Redirecting to Yoco…" : label}
      </Button>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
