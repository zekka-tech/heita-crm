"use client";

import { useState } from "react";

type ExportButtonProps = {
  businessId: string;
  actorUserId?: string;
  targetUserId?: string;
  action?: string;
  from?: string;
  to?: string;
};

export function ExportButton({
  businessId,
  actorUserId,
  targetUserId,
  action,
  from,
  to
}: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const url = new URL(
        `/dashboard/${businessId}/settings/audit/export`,
        window.location.origin
      );
      if (actorUserId) url.searchParams.set("actorUserId", actorUserId);
      if (targetUserId) url.searchParams.set("targetUserId", targetUserId);
      if (action) url.searchParams.set("action", action);
      if (from) url.searchParams.set("from", from);
      if (to) url.searchParams.set("to", to);

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error("Export failed");
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-primary/30 hover:text-primary-action disabled:opacity-50"
    >
      {loading ? "Exporting…" : "Export CSV"}
    </button>
  );
}
