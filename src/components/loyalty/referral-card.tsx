"use client";

import { useCallback, useState } from "react";
import { Copy, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

type ReferralCardProps = {
  code: string;
  businessSlug: string;
};

export function ReferralCard({ code, businessSlug }: ReferralCardProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/b/${businessSlug}/join?ref=${code}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Join our loyalty programme and earn points! ${shareUrl}`)}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl]);

  return (
    <Card variant="surface" className="space-y-3">
      <CardHeader
        title="Refer a friend"
        description={`Share your link and earn ${50} bonus points when they join and make their first purchase.`}
      />
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-elevated px-3 py-2 font-mono text-sm">
        <span className="flex-1 truncate">{code}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          aria-label="Copy referral code"
        >
          {copied ? (
            <span className="text-xs font-semibold text-green-600">Copied</span>
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={handleCopy}
        >
          <Copy className="mr-2 h-4 w-4" />
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button variant="secondary" size="sm" className="flex-1" asChild>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
            <Share2 className="mr-2 h-4 w-4" />
            WhatsApp
          </a>
        </Button>
      </div>
    </Card>
  );
}
