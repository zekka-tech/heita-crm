"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [updateWaiting, setUpdateWaiting] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setCanInstall(true);
    };

    const onControllerChange = () => {
      // Signal the banner to offer a manual refresh rather than reloading
      // mid-session, which would discard unsaved form state.
      setUpdateWaiting(true);
    };

    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    navigator.serviceWorker?.getRegistration().then((registration) => {
      if (registration?.waiting) {
        setUpdateWaiting(true);
      }

      registration?.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateWaiting(true);
          }
        });
      });
    });

    return () => {
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  async function install() {
    if (!promptEvent) {
      return false;
    }

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    const accepted = choice.outcome === "accepted";
    if (accepted) {
      setCanInstall(false);
      setPromptEvent(null);
    }
    return accepted;
  }

  async function applyUpdate() {
    const registration = await navigator.serviceWorker?.getRegistration();
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
  }

  return {
    canInstall,
    updateWaiting,
    install,
    applyUpdate
  };
}
