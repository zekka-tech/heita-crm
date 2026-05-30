"use client";

import { useActionState, useCallback, useState, useTransition } from "react";
import type { ReactNode } from "react";

import { earnPointsAction, searchMembersAction } from "@/app/dashboard/[businessId]/loyalty/actions";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

type MemberResult = {
  id: string;
  pointsBalance: number;
  user: { phone: string | null; name: string | null; id: string };
};

type Props = {
  businessId: string;
  csrfField: ReactNode;
};

type State = { error: string | null; key: string };

async function earnPointsWithReset(prev: State, formData: FormData): Promise<State> {
  const nextKey = crypto.randomUUID();
  try {
    await earnPointsAction(formData);
    return { error: null, key: nextKey };
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.startsWith("NEXT_REDIRECT") ||
        (err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT"))
    ) {
      throw err;
    }
    return { error: err instanceof Error ? err.message : "An unexpected error occurred.", key: nextKey };
  }
}

const INITIAL_STATE: State = { error: null, key: crypto.randomUUID() };

export function EarnPointsForm({ businessId, csrfField }: Props) {
  const [state, formAction] = useActionState(earnPointsWithReset, INITIAL_STATE);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberResult[]>([]);
  const [selected, setSelected] = useState<MemberResult | null>(null);
  const [isSearching, startSearch] = useTransition();

  const search = useCallback(
    (value: string) => {
      setQuery(value);
      setSelected(null);
      if (value.trim().length < 2) {
        setResults([]);
        return;
      }
      startSearch(async () => {
        const r = await searchMembersAction(businessId, value);
        setResults(r);
      });
    },
    [businessId]
  );

  const pick = (member: MemberResult) => {
    setSelected(member);
    setQuery(member.user.phone ?? member.user.name ?? member.user.id);
    setResults([]);
  };

  return (
    <form action={formAction} className="grid gap-3">
      {csrfField}
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="idempotencyKey" value={state.key} />
      {selected ? (
        <input type="hidden" name="membershipId" value={selected.id} />
      ) : null}

      <div className="relative">
        <Input
          label="Customer"
          type="search"
          autoComplete="off"
          placeholder="Search by phone or name…"
          value={query}
          onChange={(e) => search(e.target.value)}
          hint={selected ? `${selected.pointsBalance} pts balance` : undefined}
          required
        />
        {results.length > 0 && !selected ? (
          <ul
            role="listbox"
            className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-line bg-surface shadow-lg"
          >
            {results.map((m) => (
              <li
                key={m.id}
                role="option"
                aria-selected={false}
                className="cursor-pointer px-4 py-2 text-sm text-ink hover:bg-surface-elevated"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
              >
                <span className="font-medium">{m.user.phone ?? m.user.name ?? m.user.id}</span>
                {m.user.name && m.user.phone ? (
                  <span className="ml-2 text-ink-subtle">{m.user.name}</span>
                ) : null}
                <span className="ml-auto float-right text-xs text-ink-subtle">{m.pointsBalance} pts</span>
              </li>
            ))}
          </ul>
        ) : null}
        {isSearching ? (
          <p className="mt-1 text-xs text-ink-subtle">Searching…</p>
        ) : null}
      </div>

      <Input
        name="points"
        type="number"
        min={1}
        placeholder="Points to add"
        label="Points"
        required
      />
      <Input name="description" label="Description" placeholder="e.g. In-store purchase" />
      {state.error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      <SubmitButton variant="primary" disabled={!selected}>
        Issue points
      </SubmitButton>
    </form>
  );
}
