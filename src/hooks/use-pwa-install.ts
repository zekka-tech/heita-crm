"use client";

import { useEffect, useState } from "react";

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
};

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<DeferredInstallPrompt | null>(null);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as DeferredInstallPrompt);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  return {
    canInstall: Boolean(promptEvent),
    async install() {
      if (!promptEvent) return;

      await promptEvent.prompt();
      setPromptEvent(null);
    }
  };
}

