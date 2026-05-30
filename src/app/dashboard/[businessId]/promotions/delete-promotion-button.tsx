"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { deletePromotionAction } from "@/app/dashboard/[businessId]/promotions/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Props = {
  businessId: string;
  promotionId: string;
  label: string;
};

export function DeletePromotionButton({ businessId, promotionId, label }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("businessId", businessId);
      formData.set("promotionId", promotionId);
      await deletePromotionAction(formData);
      setOpen(false);
    });
  };

  return (
    <>
      <ConfirmDialog
        open={open}
        title="Delete this promotion?"
        description="This will permanently remove the promotion. Any scheduled broadcasts will be cancelled."
        confirmLabel="Delete"
        destructive
        isPending={isPending}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
      <Button
        type="button"
        variant="danger"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={isPending}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        {label}
      </Button>
    </>
  );
}
