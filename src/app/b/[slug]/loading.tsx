import { Skeleton } from "@/components/ui/skeleton";

export default function BusinessProfileLoading() {
  return (
    <main aria-busy="true" aria-label="Loading business profile…" className="px-4 pb-24 pt-6 space-y-6 max-w-2xl mx-auto">
      <p className="sr-only">Loading business profile, please wait.</p>
      {/* Hero card */}
      <Skeleton className="h-40 w-full rounded-2xl" />
      {/* Action buttons */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-xl" />
        <Skeleton className="h-10 flex-1 rounded-xl" />
      </div>
      {/* Info rows */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    </main>
  );
}
