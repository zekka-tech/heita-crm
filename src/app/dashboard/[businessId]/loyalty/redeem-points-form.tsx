"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";

import { redeemPointsAction } from "@/app/dashboard/[businessId]/loyalty/actions";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

type Membership = {
  id: string;
  pointsBalance: number;
  user: { phone: string | null; name: string | null; id: string };
};

type Props = {
  businessId: string;
  memberships: Membership[];
  /** Server-rendered CSRF hidden field passed as a child. */
  csrfField: ReactNode;
};

type State = { error: string | null; key: string };

async function redeemPointsWithReset(
  prev: State,
  formData: FormData
): Promise<State> {
  const nextKey = crypto.randomUUID();
  try {
    await redeemPointsAction(formData);
    // redeemPointsAction always redirects on success; this line is unreachable.
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

export function RedeemPointsForm({ businessId, memberships, csrfField }: Props) {
  const [state, formAction] = useActionState(redeemPointsWithReset, INITIAL_STATE);

  return (
    <form action={formAction} className="grid gap-3">
      {csrfField}
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="idempotencyKey" value={state.key} />
      <Select name="membershipId" label="Customer" defaultValue="" required>
        <option value="" disabled>
          Select a member
        </option>
        {memberships.map((membership) => (
          <option key={membership.id} value={membership.id}>
            {membership.user.phone ?? membership.user.name ?? membership.user.id}{" "}
            · {membership.pointsBalance} pts
          </option>
        ))}
      </Select>
      <Input
        name="points"
        type="number"
        min={1}
        placeholder="Points to redeem"
        label="Points"
        required
      />
      <Input
        name="description"
        label="Description"
        placeholder="e.g. Manual staff redemption"
      />
      {state.error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      <SubmitButton variant="danger">Redeem points</SubmitButton>
    </form>
  );
}
