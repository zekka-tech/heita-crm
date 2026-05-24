"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCsrfToken } from "@/hooks/use-csrf-token";
import { appendCsrfHeader } from "@/lib/csrf";

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
          `/api/upload/${createPayload.documentId}/complete`,
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
        <h2 className="section-title">Upload a document</h2>
        <p className="mt-1 text-sm text-ink-muted">
          PDF, DOCX, CSV, Markdown, and plain text are supported.
        </p>
      </div>

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
    </Card>
  );
}
