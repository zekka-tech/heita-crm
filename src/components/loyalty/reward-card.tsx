import { Gift, Sparkles } from "lucide-react";

import { Chip } from "@/components/ui/badge";

type RewardCardProps = {
  reward: {
    title: string;
    description?: string | null;
    pointsCost: number;
    stock?: number | null;
    imageUrl?: string | null;
  };
  available: boolean;
  action?: React.ReactNode;
};

export function RewardCard({ reward, available, action }: RewardCardProps) {
  return (
    <article className="group flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-md transition hover:shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent-foreground">
            <Gift className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-ink">
              {reward.title}
            </h3>
            {reward.description ? (
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                {reward.description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-display text-2xl font-bold text-primary-action">
            {reward.pointsCost}
          </p>
          <p className="metric-label">points</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {reward.stock === null || reward.stock === undefined ? (
            <Chip variant="success" size="sm">
              <Sparkles className="h-3 w-3" />
              Unlimited
            </Chip>
          ) : reward.stock <= 0 ? (
            <Chip variant="warning" size="sm">
              Out of stock
            </Chip>
          ) : (
            <Chip variant="default" size="sm">
              {reward.stock} left
            </Chip>
          )}
          {!available ? (
            <Chip variant="warning" size="sm">
              Not enough points
            </Chip>
          ) : null}
        </div>
        {action}
      </div>
    </article>
  );
}
