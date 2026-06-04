"use client";

import { useState, useCallback } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement("input");
      input.value = value;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [value]);

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} aria-label="Copy to clipboard">
      {copied ? (
        <span className="text-xs font-semibold text-green-600">Copied</span>
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );
}
