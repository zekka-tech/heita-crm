"use client";

import { Download, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";

export function PwaInstallBanner() {
  const { canInstall, updateWaiting, install, applyUpdate } = usePwaInstall();

  if (!canInstall && !updateWaiting) {
    return null;
  }

  return (
    <div className="sticky top-2 z-50 mx-4 mt-2 rounded-2xl border border-line bg-surface px-4 py-3 shadow-lg sm:mx-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-sm font-semibold text-ink">
            {updateWaiting ? "App update ready" : "Install Heita"}
          </p>
          <p className="text-xs text-ink-muted">
            {updateWaiting
              ? "Refresh to load the latest offline cache and app shell."
              : "Add Heita to your home screen for a faster, app-like experience."}
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={updateWaiting ? applyUpdate : install}
        >
          {updateWaiting ? <RefreshCw className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          {updateWaiting ? "Refresh app" : "Install"}
        </Button>
      </div>
    </div>
  );
}
