import { Main } from "@/components/layout/Page";
import { Skeleton } from "@/components/ui/skeleton";

/** The city page's shape while it renders for the first time. */
export default function Loading() {
  return (
    <Main className="gap-8" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex gap-2">
          <Skeleton className="h-11 w-28 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-full" />
        </div>
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-12 w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </Main>
  );
}
