"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { deleteEventAction } from "@/app/dashboard/[businessId]/events/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Props = {
  businessId: string;
  eventId: string;
  iconOnly?: boolean;
};

export function DeleteEventButton({ businessId, eventId, iconOnly = false }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("businessId", businessId);
      formData.set("eventId", eventId);
      await deleteEventAction(formData);
      setOpen(false);
    });
  };

  return (
    <>
      <ConfirmDialog
        open={open}
        title="Delete this event?"
        description="This will permanently remove the event. Attendees will no longer see it."
        confirmLabel="Delete"
        destructive
        isPending={isPending}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
      <Button
        type="button"
        variant={iconOnly ? "ghost" : "danger"}
        size="sm"
        onClick={() => setOpen(true)}
        disabled={isPending}
        aria-label="Delete event"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        {!iconOnly && "Delete"}
      </Button>
    </>
  );
}
