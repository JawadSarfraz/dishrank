// min-h-dvh here and in its page: the cached page swaps this skeleton for the content on load, and
// the footer must stay below the fold in both, or the swap moves it (a layout shift on long lists).
import { Main } from "@/components/layout/Page";
import { Skeleton } from "@/components/ui/skeleton";

/** The restaurant page's shape while it renders for the first time. */
export default function Loading() {
  return (
    <Main className="min-h-dvh gap-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-5 w-40" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
      </div>
      <Skeleton className="h-7 w-32" />
      <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-3">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
            <Skeleton className="h-10 w-14" />
          </div>
        ))}
      </div>
    </Main>
  );
}
