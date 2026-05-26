"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle, Loader2, Receipt, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "processing" }
  | { kind: "done"; pointsToAward: number | null }
  | { kind: "error"; message: string };

type Props = {
  businessId: string;
  uploadEndpoint?: string;
};

export function ReceiptUpload({ businessId, uploadEndpoint = "/api/upload" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setState({ kind: "error", message: "Please select an image file." });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setState({ kind: "error", message: "Image must be under 10 MB." });
      return;
    }

    setState({ kind: "uploading" });

    // Get presigned upload URL
    let imageUrl: string;
    try {
      const presignResp = await fetch(uploadEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type, purpose: "receipt" })
      });

      if (!presignResp.ok) throw new Error("Failed to get upload URL.");
      const { url, publicUrl } = (await presignResp.json()) as {
        url: string;
        publicUrl: string;
      };

      await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file
      });

      imageUrl = publicUrl;
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Upload failed."
      });
      return;
    }

    setState({ kind: "processing" });

    // Submit for OCR
    try {
      const resp = await fetch("/api/receipts/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, imageUrl })
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Processing failed.");
      }

      const { pointsToAward } = (await resp.json()) as { pointsToAward: number | null };
      setState({ kind: "done", pointsToAward });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Receipt processing failed."
      });
    }
  }

  return (
    <Card variant="surface" className="space-y-4">
      <div className="flex items-center gap-3">
        <Receipt className="h-5 w-5 text-primary-action" />
        <div>
          <h3 className="font-display font-semibold text-ink">Upload a receipt</h3>
          <p className="text-sm text-ink-muted">
            Earn points automatically from your in-store purchases.
          </p>
        </div>
      </div>

      {state.kind === "idle" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-surface-elevated px-4 py-8 text-ink-muted transition-colors hover:border-primary-action hover:bg-blue-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Select receipt image to upload"
          >
            <Upload className="h-8 w-8" aria-hidden="true" />
            <span className="text-sm font-medium">Tap to upload a receipt photo</span>
            <span className="text-xs">JPG, PNG, HEIC · max 10 MB</span>
          </button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              if (inputRef.current) {
                inputRef.current.capture = "environment";
                inputRef.current.click();
              }
            }}
          >
            <Camera className="h-4 w-4" />
            Take a photo
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </div>
      )}

      {state.kind === "uploading" && (
        <div className="flex items-center justify-center gap-2 py-6 text-ink-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">Uploading image…</span>
        </div>
      )}

      {state.kind === "processing" && (
        <div className="flex items-center justify-center gap-2 py-6 text-ink-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">Reading your receipt…</span>
        </div>
      )}

      {state.kind === "done" && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-3 py-6 text-center"
        >
          <CheckCircle className="h-10 w-10 text-green-500" aria-hidden="true" />
          <p className="font-semibold text-ink">Receipt submitted!</p>
          <p className="text-sm text-ink-muted">
            {state.pointsToAward !== null
              ? `Your ${state.pointsToAward} points are pending staff approval.`
              : "A staff member will review your receipt and award points shortly."}
          </p>
          <Button variant="secondary" onClick={() => setState({ kind: "idle" })}>
            Submit another
          </Button>
        </div>
      )}

      {state.kind === "error" && (
        <div role="alert" className="space-y-3">
          <p className="text-sm text-red-600">{state.message}</p>
          <Button variant="secondary" onClick={() => setState({ kind: "idle" })}>
            Try again
          </Button>
        </div>
      )}
    </Card>
  );
}
