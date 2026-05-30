"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)heita-csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export function DeleteAccountButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "x-heita-csrf": getCsrfToken() }
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to delete account.");
      }
      router.push("/sign-in?message=account-deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        className="border-danger/40 text-danger hover:bg-danger/10 hover:border-danger"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete My Account
      </Button>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-account-heading"
      aria-describedby="delete-account-description"
      className="rounded-xl border border-danger/30 bg-danger/5 p-4 space-y-3"
    >
      <p id="delete-account-heading" className="text-sm font-medium text-danger">
        Are you absolutely sure?
      </p>
      <p id="delete-account-description" className="text-sm text-ink-muted">
        This will permanently delete your account and all associated data. This action cannot be
        undone.
      </p>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { setOpen(false); setError(null); }}
          disabled={loading}
          autoFocus
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="bg-danger text-white hover:bg-danger/90"
          onClick={handleDelete}
          disabled={loading}
        >
          {loading ? "Deleting…" : "Delete Account"}
        </Button>
      </div>
    </div>
  );
}
