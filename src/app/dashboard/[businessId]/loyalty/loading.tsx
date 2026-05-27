import { Skeleton, StatCardSkeleton } from "@/components/ui/skeleton";

export default function LoyaltyLoading() {
  return (
    <main className="px-4 pb-24 pt-6 sm:px-8 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </main>
  );
}
