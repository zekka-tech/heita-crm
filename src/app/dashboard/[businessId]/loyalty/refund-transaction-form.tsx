"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";

import { refundTransactionAction } from "@/app/dashboard/[businessId]/loyalty/actions";
import { SubmitButton } from "@/components/ui/submit-button";

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
  const [state, formAction] = useActionState(refundTransactionWithReset, INITIAL_STATE);

  return (
    <form action={formAction}>
      {csrfField}
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="transactionId" value={transactionId} />
      <input type="hidden" name="idempotencyKey" value={state.key} />
      {state.error ? (
        <p role="alert" className="mb-1 text-xs font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      <SubmitButton variant="secondary" size="sm">
        Refund
      </SubmitButton>
    </form>
  );
}
