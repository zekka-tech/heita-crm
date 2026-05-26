"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

type TurnstileWidgetProps = {
  siteKey: string | null;
  action?: string;
  onToken: (token: string) => void;
  className?: string;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        target: string | HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export function TurnstileWidget({ siteKey, action, onToken, className }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || typeof window === "undefined") return;

    const renderWhenReady = () => {
      if (!containerRef.current || !window.turnstile) {
        return false;
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken("")
      });
      return true;
    };

    if (renderWhenReady()) return;

    const interval = window.setInterval(() => {
      if (renderWhenReady()) {
        window.clearInterval(interval);
      }
    }, 200);

    return () => {
      window.clearInterval(interval);
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [siteKey, action, onToken]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        async
        defer
      />
      <div aria-label="Security verification">
        <div ref={containerRef} className={className} />
      </div>
    </>
  );
}
