import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <main className="px-4 pb-24 pt-6 space-y-4">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <CardSkeleton />
      <CardSkeleton />
    </main>
  );
}
