// "Rate the places you know" while its list loads (spec §3: static blush blocks in the final
// layout, no shimmer). Its own file, so the dish page can show it before the list's code arrives.
export function RateSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col">
      <p role="status" className="sr-only">
        Loading places…
      </p>
      <div aria-hidden="true" className="flex flex-col">
        <div className="mt-2 h-10 w-full rounded-control bg-blush" />
        <div className="mt-4 h-5 w-44 rounded-chip bg-blush" />
        <div className="mt-1.5 h-12 w-full rounded-field bg-blush" />
        <div className="mt-4 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[178px] rounded-card bg-blush" />
          ))}
        </div>
      </div>
    </div>
  );
}
