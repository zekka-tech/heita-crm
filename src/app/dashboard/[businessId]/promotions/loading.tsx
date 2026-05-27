import { Skeleton } from "@/components/ui/skeleton";

export default function PromotionsLoading() {
  return (
    <main className="px-4 pb-24 pt-6 sm:px-8 space-y-4">
      <Skeleton className="h-10 w-48 rounded-lg" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </main>
  );
}
