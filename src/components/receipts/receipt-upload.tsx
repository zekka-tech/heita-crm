"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle, ClipboardCopy, Loader2, Receipt, Upload, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type OcrFeedback = {
  receiptId: string;
  pointsToAward: number | null;
  detectedTotal: number | null;
  detectedBusiness: string | null;
  confidence: "high" | "medium" | "low";
};

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "scanning"; progress: number }
  | { kind: "processing" }
  | { kind: "done"; feedback: OcrFeedback }
  | { kind: "error"; message: string };

type Props = {
  businessId: string;
  uploadEndpoint?: string;
};

// Self-hosted Tesseract.js assets (served same-origin from /public so they are
// not blocked by the strict CSP). See scripts/copy-tesseract-assets.mjs.
const TESSERACT_WORKER_PATH = "/tesseract/worker.min.js";
const TESSERACT_CORE_PATH = "/tesseract"; // directory; SIMD variant auto-selected
const TESSERACT_LANG_PATH = "/tesseract/lang";

/**
 * Run client-side OCR on the selected image using Tesseract.js (WASM, in the
 * browser). Returns the recognised text, or "" on any failure so the caller
 * can fall back to the server-side vision API. `onProgress` receives 0..1.
 */
async function runClientOcr(file: File, onProgress: (p: number) => void): Promise<string> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1 /* OEM.LSTM_ONLY */, {
      workerPath: TESSERACT_WORKER_PATH,
      corePath: TESSERACT_CORE_PATH,
      langPath: TESSERACT_LANG_PATH,
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") onProgress(m.progress);
      }
    });
    try {
      const { data } = await worker.recognize(file);
      return data.text ?? "";
    } finally {
      await worker.terminate();
    }
  } catch {
    // Any OCR failure (unsupported browser, asset load error, etc.) is
    // non-fatal: the server falls back to the DeepSeek vision API.
    return "";
  }
}

export function ReceiptUpload({ businessId, uploadEndpoint = "/api/upload" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

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

    // Primary OCR runs on-device in the browser (Tesseract.js, WASM). If it
    // fails or returns nothing, we POST an empty rawText and the server falls
    // back to the DeepSeek cloud vision API.
    setState({ kind: "scanning", progress: 0 });
    const rawText = await runClientOcr(file, (progress) =>
      setState({ kind: "scanning", progress })
    );

    setState({ kind: "processing" });

    try {
      const resp = await fetch("/api/receipts/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, imageUrl, rawText })
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Processing failed.");
      }

      const result = (await resp.json()) as {
        receiptId: string;
        pointsToAward: number | null;
        ocrResult: {
          total: number | null;
          businessName: string | null;
          confidence: "high" | "medium" | "low";
        };
      };

      setState({
        kind: "done",
        feedback: {
          receiptId: result.receiptId,
          pointsToAward: result.pointsToAward,
          detectedTotal: result.ocrResult.total,
          detectedBusiness: result.ocrResult.businessName,
          confidence: result.ocrResult.confidence
        }
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Receipt processing failed."
      });
    }
  }

  async function copyReceiptId(id: string) {
    await navigator.clipboard.writeText(id).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

      {state.kind === "scanning" && (
        <div className="space-y-2 py-6" role="status" aria-live="polite">
          <div className="flex items-center justify-center gap-2 text-ink-muted">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span className="text-sm">
              Scanning on your device… {Math.round(state.progress * 100)}%
            </span>
          </div>
          <div
            className="mx-auto h-1.5 w-48 overflow-hidden rounded-full bg-surface-elevated"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(state.progress * 100)}
          >
            <div
              className="h-full rounded-full bg-primary-action transition-all"
              style={{ width: `${Math.round(state.progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {state.kind === "processing" && (
        <div className="flex items-center justify-center gap-2 py-6 text-ink-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">Reading your receipt…</span>
        </div>
      )}

      {state.kind === "done" && (
        <ReceiptSuccessFeedback
          feedback={state.feedback}
          copied={copied}
          onCopy={copyReceiptId}
          onReset={() => { setState({ kind: "idle" }); setCopied(false); }}
        />
      )}

      {state.kind === "error" && (
        <div role="alert" className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
            <p className="text-sm text-red-700">{state.message}</p>
          </div>
          <Button variant="secondary" onClick={() => setState({ kind: "idle" })}>
            Try again
          </Button>
        </div>
      )}
    </Card>
  );
}

function ReceiptSuccessFeedback({
  feedback,
  copied,
  onCopy,
  onReset
}: {
  feedback: OcrFeedback;
  copied: boolean;
  onCopy: (id: string) => Promise<void>;
  onReset: () => void;
}) {
  const { receiptId, pointsToAward, detectedTotal, detectedBusiness, confidence } = feedback;

  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CheckCircle className="h-10 w-10 text-green-500" aria-hidden="true" />
        <p className="font-display text-lg font-semibold text-ink">Receipt submitted!</p>
        <p className="text-sm text-ink-muted">
          {pointsToAward !== null
            ? `${pointsToAward} points are pending staff approval.`
            : "A staff member will review your receipt and award points shortly."}
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface-elevated divide-y divide-line">
        {detectedBusiness && (
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-ink-muted">Store detected</span>
            <span className="font-medium text-ink">{detectedBusiness}</span>
          </div>
        )}
        {detectedTotal !== null && (
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-ink-muted">Total detected</span>
            <span className="font-medium text-ink">R{detectedTotal.toFixed(2)}</span>
          </div>
        )}
        {pointsToAward !== null && (
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-ink-muted">Points pending</span>
            <span className="font-semibold text-primary-action">{pointsToAward} pts</span>
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-3 text-sm">
          <span className="text-ink-muted">Scan quality</span>
          <ConfidenceBadge confidence={confidence} />
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">Receipt ID</p>
            <p className="truncate font-mono text-xs text-ink">{receiptId}</p>
          </div>
          <button
            type="button"
            onClick={() => void onCopy(receiptId)}
            className="shrink-0 rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Copy receipt ID"
          >
            <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
            {copied && <span className="sr-only">Copied!</span>}
          </button>
        </div>
      </div>

      {confidence === "low" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The image was hard to read clearly. For faster approval, keep receipts flat and well-lit.
        </p>
      )}

      <p className="text-center text-xs text-ink-subtle">
        Save your Receipt ID if you need to follow up with staff.
      </p>

      <Button variant="secondary" className="w-full" onClick={onReset}>
        Submit another receipt
      </Button>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-green-100 text-green-800",
    medium: "bg-amber-100 text-amber-800",
    low: "bg-red-100 text-red-800"
  } as const;
  const labels = { high: "Clear", medium: "Partial", low: "Unclear" } as const;

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[confidence]}`}>
      {labels[confidence]}
    </span>
  );
}
