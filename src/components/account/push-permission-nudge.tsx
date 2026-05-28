"use client";

import { Bell, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useCsrfToken } from "@/hooks/use-csrf-token";
import { appendCsrfHeader } from "@/lib/csrf";

const DISMISSED_KEY = "push-nudge-dismissed-v1";

function base64UrlToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function PushPermissionNudge() {
  const csrfToken = useCsrfToken();
  const [visible, setVisible] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (
      !vapidKey ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      Notification.permission !== "default" ||
      localStorage.getItem(DISMISSED_KEY)
    ) {
      return;
    }

    navigator.serviceWorker.ready
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        if (!sub) setVisible(true);
      })
      .catch(() => undefined);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  };

  const enable = () => {
    startTransition(async () => {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) return;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        dismiss();
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(vapidKey)
        }));

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: appendCsrfHeader({ "Content-Type": "application/json" }, csrfToken),
        body: JSON.stringify(subscription),
        credentials: "same-origin"
      }).catch(() => undefined);

      setVisible(false);
    });
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Enable push notifications"
      className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3"
    >
      <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary-action" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">Stay in the loop</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          Get notified about rewards, tier upgrades, and promotions.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={enable}
            disabled={isPending || !csrfToken}
          >
            Enable notifications
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="shrink-0 rounded p-0.5 text-ink-subtle transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
