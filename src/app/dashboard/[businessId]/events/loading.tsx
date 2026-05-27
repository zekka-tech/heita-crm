import { Skeleton } from "@/components/ui/skeleton";

export default function EventsLoading() {
  return (
    <main className="px-4 pb-24 pt-6 sm:px-8 space-y-4">
      <Skeleton className="h-10 w-48 rounded-lg" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </main>
  );
}
