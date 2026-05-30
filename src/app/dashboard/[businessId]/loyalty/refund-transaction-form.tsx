"use client";

import { useActionState, useRef, useState } from "react";
import type { ReactNode } from "react";

import { refundTransactionAction } from "@/app/dashboard/[businessId]/loyalty/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Props = {
  businessId: string;
  transactionId: string;
  /** Server-rendered CSRF hidden field passed as a child. */
  csrfField: ReactNode;
};

type State = { error: string | null; key: string };

async function refundTransactionWithReset(
  prev: State,
  formData: FormData
): Promise<State> {
  const nextKey = crypto.randomUUID();
  try {
    await refundTransactionAction(formData);
    // refundTransactionAction always redirects on success; this line is unreachable.
    return { error: null, key: nextKey };
  } catch (err) {
    // Next.js redirect() throws a special NEXT_REDIRECT error — re-throw it so
    // the navigation still happens. Any other error is a validation failure.
    if (
      err instanceof Error &&
      (err.message.startsWith("NEXT_REDIRECT") ||
        (err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT"))
    ) {
      throw err;
    }
    return {
      error: err instanceof Error ? err.message : "An unexpected error occurred.",
      key: nextKey
    };
  }
}

const INITIAL_STATE: State = { error: null, key: crypto.randomUUID() };

export function RefundTransactionForm({ businessId, transactionId, csrfField }: Props) {
  const [state, formAction, isPending] = useActionState(refundTransactionWithReset, INITIAL_STATE);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <ConfirmDialog
        open={confirmOpen}
        title="Refund this transaction?"
        description="The points awarded for this transaction will be reversed. This action cannot be undone."
        confirmLabel="Refund"
        destructive
        isPending={isPending}
        onConfirm={() => formRef.current?.requestSubmit()}
        onCancel={() => setConfirmOpen(false)}
      />
      <form ref={formRef} action={formAction}>
        {csrfField}
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="transactionId" value={transactionId} />
        <input type="hidden" name="idempotencyKey" value={state.key} />
        {state.error ? (
          <p role="alert" className="mb-1 text-xs font-medium text-danger">
            {state.error}
          </p>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
        >
          Refund
        </Button>
      </form>
    </>
  );
}
