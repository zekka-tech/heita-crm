import { BusinessCardSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <main className="px-4 pb-24 pt-6 space-y-4">
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-6 w-40 rounded" />
      <div className="grid gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <BusinessCardSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
