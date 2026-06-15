"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp, Globe, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WebSourceForm } from "@/components/ai/web-source-form";
import { useCsrfToken } from "@/hooks/use-csrf-token";
import { appendCsrfHeader } from "@/lib/csrf";

type UploadTab = "file" | "web";

const SUPPORTED_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

type DocumentUploadCardProps = {
  businessId: string;
};

export function DocumentUploadCard({ businessId }: DocumentUploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const [tab, setTab] = useState<UploadTab>("file");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onUpload = () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setStatus("Choose a file before uploading.");
      return;
    }

    if (!SUPPORTED_TYPES.has(file.type)) {
      setStatus("That file type is not supported yet.");
      return;
    }

    startTransition(async () => {
      setStatus("Preparing upload…");

      try {
        const createResponse = await fetch("/api/upload", {
          method: "POST",
          headers: appendCsrfHeader(
            {
              "Content-Type": "application/json"
            },
            csrfToken
          ),
          body: JSON.stringify({
            businessId,
            title: title.trim() || file.name,
            filename: file.name,
            contentType: file.type,
            byteSize: file.size
          })
        });

        const createPayload = (await createResponse.json()) as {
          error?: string;
          documentId?: string;
          uploadUrl?: string;
          uploadMethod?: string;
          uploadHeaders?: Record<string, string>;
        };

        if (!createResponse.ok || !createPayload.documentId || !createPayload.uploadUrl) {
          throw new Error(createPayload.error ?? "Upload could not be prepared.");
        }

        setStatus("Uploading file…");
        const uploadResponse = await fetch(createPayload.uploadUrl, {
          method: createPayload.uploadMethod ?? "PUT",
          headers: createPayload.uploadHeaders,
          body: file
        });

        if (!uploadResponse.ok) {
          throw new Error("The file upload to storage failed.");
        }

        setStatus("Queueing document ingestion…");
        const completeResponse = await fetch(
          `/api/upload/${createPayload.documentId}/complete?businessId=${encodeURIComponent(businessId)}`,
          {
            method: "POST",
            headers: appendCsrfHeader(undefined, csrfToken)
          }
        );
        const completePayload = (await completeResponse.json()) as { error?: string };

        if (!completeResponse.ok) {
          throw new Error(completePayload.error ?? "The document could not be queued.");
        }

        setStatus("Upload complete. Ingestion has started.");
        setTitle("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        router.refresh();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Upload failed.");
      }
    });
  };

  return (
    <Card variant="surface" className="space-y-4">
      <div>
        <h2 className="section-title">Add knowledge</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Train the AI on your real material — upload a document or point it at your website.
        </p>
      </div>

      <div className="flex gap-1 rounded-xl border border-line bg-surface-elevated p-1" role="tablist" aria-label="Knowledge source">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "file"}
          onClick={() => setTab("file")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            tab === "file" ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          <FileUp className="h-4 w-4" />
          Upload file
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "web"}
          onClick={() => setTab("web")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            tab === "web" ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          <Globe className="h-4 w-4" />
          Add web pages
        </button>
      </div>

      {tab === "file" ? (
        <>
          <p className="text-sm text-ink-muted">
            PDF, DOCX, CSV, Markdown, and plain text are supported.
          </p>
          <div className="grid gap-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Document title"
              className="input"
            />
            <input ref={fileInputRef} type="file" className="input" />
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onUpload}
              disabled={isPending || !csrfToken}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload document
            </Button>
            {status ? <p className="text-xs text-ink-muted" aria-live="polite" role="status">{status}</p> : null}
          </div>
        </>
      ) : (
        <WebSourceForm businessId={businessId} />
      )}
    </Card>
  );
}
