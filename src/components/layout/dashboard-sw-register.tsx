"use client";

import { useEffect } from "react";

import { setupOutboxSync } from "@/lib/offline-outbox";

export function DashboardSWRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/dashboard/sw", {
      scope: "/dashboard/"
    });

    const cleanup = setupOutboxSync();
    return cleanup;
  }, []);

  return null;
}
