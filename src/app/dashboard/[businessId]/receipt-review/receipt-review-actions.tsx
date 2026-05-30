"use client";

import { useState } from "react";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";

type Props = {
  receiptId: string;
  businessId: string;
  suggestedPoints: number;
};

export function ReceiptReviewActions({ receiptId, businessId, suggestedPoints }: Props) {
  const router = useRouter();
  const [overridePoints, setOverridePoints] = useState(suggestedPoints.toString());
  const [submitting, setSubmitting] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  async function handleAction(action: "approve" | "reject") {
    setSubmitting(true);
    try {
      const points = parseInt(overridePoints, 10);
      const resp = await fetch("/api/receipts/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptId,
          action,
          businessId,
          overridePoints: action === "approve" && !isNaN(points) ? points : undefined
        })
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Action failed.");
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setSubmitting(false);
      setConfirmReject(false);
    }
  }

  return (
    <div className="space-y-3">
      <ConfirmDialog
        open={confirmReject}
        title="Reject this receipt?"
        description="The customer will not receive points for this submission. This action cannot be undone."
        confirmLabel="Reject"
        destructive
        isPending={submitting}
        onConfirm={() => void handleAction("reject")}
        onCancel={() => setConfirmReject(false)}
      />
      <Input
        label="Points to award"
        type="number"
        min="0"
        value={overridePoints}
        onChange={(e) => setOverridePoints(e.target.value)}
        hint="Edit before approving if the OCR total is off."
        disabled={submitting}
      />
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => void handleAction("approve")}
          disabled={submitting}
          aria-label="Approve receipt and award points"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
          )}
          Approve
        </Button>
        <Button
          variant="danger"
          className="flex-1"
          onClick={() => setConfirmReject(true)}
          disabled={submitting}
          aria-label="Reject receipt"
        >
          <XCircle className="h-4 w-4" aria-hidden="true" />
          Reject
        </Button>
      </div>
    </div>
  );
}
