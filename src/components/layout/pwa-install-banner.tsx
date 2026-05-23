"use client";

import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";

export function PwaInstallBanner() {
  const { canInstall, install } = usePwaInstall();

  if (!canInstall) return null;

  return (
    <div className="surface mx-4 mt-4 flex items-center justify-between gap-4 rounded-3xl p-4">
      <div>
        <p className="text-sm font-semibold text-[#143127]">Install Heita</p>
        <p className="text-xs text-[#456356]">
          Save the CRM to the home screen for push notifications and offline access.
        </p>
      </div>
      <Button onClick={install}>Install</Button>
    </div>
  );
}

