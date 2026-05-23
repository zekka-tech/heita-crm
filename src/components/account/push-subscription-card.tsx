"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function base64UrlToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function PushSubscriptionCard() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const available =
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

    setSupported(available);

    if (!available) {
      return;
    }

    void navigator.serviceWorker.ready.then(async (registration) => {
      const subscription = await registration.pushManager.getSubscription();
      setSubscribed(Boolean(subscription));
    });
  }, []);

  const enablePush = () => {
    startTransition(async () => {
      setStatus(null);

      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        setStatus("Push notifications are not configured for this environment.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("Browser permission was denied.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
        }));

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(subscription)
      });

      setSubscribed(response.ok);
      setStatus(response.ok ? "Push notifications enabled." : "Unable to enable push.");
    });
  };

  const disablePush = () => {
    startTransition(async () => {
      setStatus(null);

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        setSubscribed(false);
        return;
      }

      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });

      await subscription.unsubscribe();
      setSubscribed(false);
      setStatus("Push notifications disabled.");
    });
  };

  return (
    <Card variant="surface" className="space-y-4">
      <h2 className="section-title">Browser notifications</h2>
      <p className="text-sm text-ink-muted">
        Enable browser push to receive reward, tier, and business updates even when the app is
        closed.
      </p>
      <Button
        type="button"
        variant={subscribed ? "secondary" : "primary"}
        onClick={subscribed ? disablePush : enablePush}
        disabled={!supported || isPending}
      >
        {subscribed ? "Disable push notifications" : "Enable push notifications"}
      </Button>
      {!supported ? (
        <p className="text-sm text-ink-muted">
          Push is unavailable in this browser or the environment is missing a public VAPID key.
        </p>
      ) : null}
      {status ? <p className="text-sm text-ink-muted">{status}</p> : null}
    </Card>
  );
}
