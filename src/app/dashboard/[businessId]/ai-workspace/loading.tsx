import { Skeleton } from "@/components/ui/skeleton";

export default function AiWorkspaceLoading() {
  return (
    <main className="px-4 pb-24 pt-6 sm:px-8 space-y-4">
      <Skeleton className="h-10 w-56 rounded-lg" />
      <Skeleton className="h-[420px] w-full rounded-xl" />
      <Skeleton className="h-14 w-full rounded-xl" />
    </main>
  );
}
