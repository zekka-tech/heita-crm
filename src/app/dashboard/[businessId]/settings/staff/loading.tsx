import { Skeleton } from "@/components/ui/skeleton";

export default function StaffLoading() {
  return (
    <main className="px-4 pb-24 pt-6 sm:px-8 space-y-4">
      <Skeleton className="h-10 w-40 rounded-lg" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </main>
  );
}
