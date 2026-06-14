"use client";

import { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";

type OutboxState = {
  pending: number;
  syncing: boolean;
  lastSynced: Date | null;
};

export function OfflineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [outbox, setOutbox] = useState<OutboxState>({
    pending: 0,
    syncing: false,
    lastSynced: null
  });

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      // Trigger manual sync when coming back online.
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Listen for outbox sync results from the service worker.
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "OUTBOX_SYNCED") {
        setOutbox((prev) => ({
          ...prev,
          pending: event.data.remaining,
          syncing: false,
          lastSynced: new Date()
        }));
      }
      if (event.data?.type === "OUTBOX_COUNT_RESULT") {
        setOutbox((prev) => ({ ...prev, pending: event.data.count }));
      }
    };

    navigator.serviceWorker?.addEventListener("message", handleMessage);

    // Poll outbox count every 30 seconds when the tab is visible.
    const pollInterval = setInterval(() => {
      if (!document.hidden) queryOutboxCount();
    }, 30_000);

    queryOutboxCount();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      navigator.serviceWorker?.removeEventListener("message", handleMessage);
      clearInterval(pollInterval);
    };
  }, []);

  function queryOutboxCount() {
    navigator.serviceWorker?.controller?.postMessage({ type: "OUTBOX_COUNT" });
  }

  function triggerSync() {
    if (!navigator.serviceWorker?.controller) return;
    setOutbox((prev) => ({ ...prev, syncing: true }));
    navigator.serviceWorker.controller.postMessage({ type: "SYNC_NOW" });
  }

  if (isOnline && outbox.pending === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg transition-all ${
        isOnline ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"
      }`}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-4 w-4" aria-hidden="true" />
          <span>Offline — writes queued{outbox.pending > 0 ? ` (${outbox.pending})` : ""}</span>
        </>
      ) : outbox.pending > 0 ? (
        <>
          <RefreshCw
            className={`h-4 w-4 ${outbox.syncing ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          <span>
            {outbox.syncing
              ? "Syncing offline writes…"
              : `${outbox.pending} write${outbox.pending !== 1 ? "s" : ""} pending sync`}
          </span>
          {!outbox.syncing && (
            <button
              onClick={triggerSync}
              className="ml-1 underline underline-offset-2 hover:no-underline"
            >
              Sync now
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}
