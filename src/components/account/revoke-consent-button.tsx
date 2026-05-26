"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

interface RevokeConsentButtonProps {
  consentId: string;
  csrfToken: string | null;
}

export function RevokeConsentButton({ consentId, csrfToken }: RevokeConsentButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRevoke = async () => {
    setIsPending(true);
    setError(null);

    try {
      const res = await fetch(`/api/account/consents/${consentId}/revoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-heita-csrf": csrfToken } : {})
        },
        credentials: "same-origin"
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to revoke consent.");
        return;
      }

      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="danger"
        size="sm"
        onClick={handleRevoke}
        disabled={isPending}
      >
        {isPending ? "Revoking…" : "Revoke"}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
