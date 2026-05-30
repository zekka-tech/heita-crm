"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  isPending = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const onClose = () => onCancel();
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, [onCancel]);

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      className="m-auto max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm open:animate-in open:fade-in-0 open:zoom-in-95"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id="confirm-dialog-title" className="text-base font-semibold text-ink">
        {title}
      </h2>
      <p id="confirm-dialog-desc" className="mt-2 text-sm text-ink-muted">
        {description}
      </p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={isPending}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={destructive ? "danger" : "primary"}
          size="sm"
          onClick={onConfirm}
          disabled={isPending}
        >
          {isPending ? "Please wait…" : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
