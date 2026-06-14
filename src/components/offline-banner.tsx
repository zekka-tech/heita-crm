"use client";

import { WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { getOutboxCount, syncOutbox } from "@/lib/offline-outbox";
import { cn } from "@/lib/utils";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const updatePendingCount = useCallback(() => {
    if (typeof indexedDB === "undefined") return;
    getOutboxCount()
      .then(setPendingCount)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setDismissed(false);
    };
    const handleOffline = () => setIsOffline(true);

    setIsOffline(!navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    updatePendingCount();
    const interval = setInterval(updatePendingCount, 10_000);
    return () => clearInterval(interval);
  }, [updatePendingCount]);

  if (!isOffline || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-0 z-50 flex items-center justify-between gap-3",
        "bg-warning/95 px-4 py-2.5 text-sm font-medium text-white",
        "backdrop-blur-sm"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span className="truncate">
          You&apos;re offline. Changes will sync when you reconnect.
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {pendingCount > 0 && (
          <button
            type="button"
            disabled={syncing}
            onClick={() => {
              if (syncing) return;
              setSyncing(true);
              syncOutbox()
                .then(updatePendingCount)
                .catch(() => undefined)
                .finally(() => setSyncing(false));
            }}
            className={cn(
              "rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold",
              "hover:bg-white/30 transition-colors",
              syncing && "opacity-50"
            )}
          >
            {syncing ? "Syncing..." : `${pendingCount} pending`}
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss offline banner"
          onClick={() => setDismissed(true)}
          className="rounded-full p-1 hover:bg-white/20 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
