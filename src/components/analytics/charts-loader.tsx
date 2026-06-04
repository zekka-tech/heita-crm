"use client";

import dynamic from "next/dynamic";

function ChartSkeleton() {
  return <div className="h-44 animate-pulse rounded-xl bg-surface-elevated" />;
}

export const MemberGrowthChart = dynamic(
  () => import("./charts").then((m) => m.MemberGrowthChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
export const PointsActivityChart = dynamic(
  () => import("./charts").then((m) => m.PointsActivityChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
export const MessagesChart = dynamic(
  () => import("./charts").then((m) => m.MessagesChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
export const TopRewardsTable = dynamic(
  () => import("./charts").then((m) => m.TopRewardsTable),
  { ssr: false, loading: () => <div className="h-32 animate-pulse rounded-xl bg-surface-elevated" /> }
);
