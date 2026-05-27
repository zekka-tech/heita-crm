import { Skeleton } from "@/components/ui/skeleton";

export default function MessagesLoading() {
  return (
    <main className="flex h-[calc(100dvh-4rem)] divide-x">
      <aside className="w-72 shrink-0 flex flex-col gap-2 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </aside>
      <div className="flex-1 flex flex-col gap-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-3/4 rounded-lg" />
        ))}
      </div>
    </main>
  );
}
