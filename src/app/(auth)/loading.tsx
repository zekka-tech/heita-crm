import { Skeleton } from "@/components/ui/skeleton";

export default function AuthLoading() {
  return (
    <div aria-busy="true" aria-label="Loading…" className="w-full max-w-sm space-y-4">
      <p className="sr-only">Loading, please wait.</p>
      <Skeleton className="h-10 w-48 mx-auto rounded-lg" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-10 w-full rounded-xl" />
    </div>
  );
}
