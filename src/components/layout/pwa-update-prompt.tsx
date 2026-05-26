"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export function PwaUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    function checkForWaiting(reg: ServiceWorkerRegistration) {
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        return;
      }

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
          }
        });
      });
    }

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg) checkForWaiting(reg);
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }, []);

  if (!waitingWorker) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-2xl bg-surface-elevated px-4 py-3 shadow-lg border border-line sm:bottom-6 sm:left-auto sm:right-6 sm:w-96"
    >
      <p className="text-sm text-ink">
        A new version of Heita is ready.
      </p>
      <Button
        size="sm"
        variant="primary"
        onClick={() => {
          waitingWorker.postMessage({ type: "SKIP_WAITING" });
        }}
      >
        Refresh
      </Button>
    </div>
  );
}
