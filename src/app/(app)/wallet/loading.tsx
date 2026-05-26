import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function WalletLoading() {
  return (
    <main className="px-4 pb-24 pt-6 space-y-4">
      <Skeleton className="h-36 w-full rounded-2xl" />
      {Array.from({ length: 3 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </main>
  );
}
