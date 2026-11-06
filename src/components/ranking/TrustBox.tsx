// "Why these ranks can be trusted" (home and city pages). The rater count is the city's live
// threshold (4 in early rankings, 8 after them), never a constant typed here.
import { ArrowRightIcon, Clock3Icon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

export function TrustBox({ minRaters }: { minRaters: number }) {
  const points = [
    {
      icon: ShieldCheckIcon,
      text: `Only ratings given on ${BRAND.name}. Nothing imported, nothing paid for.`,
    },
    {
      icon: UsersIcon,
      text: `A restaurant ranks once at least ${minRaters} different people have rated the dish there.`,
    },
    { icon: Clock3Icon, text: "Recent votes count more than old ones." },
  ];
  return (
    <section
      aria-labelledby="trust"
      className="flex flex-col gap-3 rounded-xl bg-brand-soft p-4 text-brand-ink sm:p-5"
    >
      <h2 id="trust" className="text-xl font-bold">
        Why these ranks can be trusted
      </h2>
      <ul className="flex flex-col gap-2.5">
        {points.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2.5 text-base">
            <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/how-rankings-work"
        className="inline-flex min-h-11 w-fit items-center gap-1 font-medium underline-offset-4 hover:underline"
      >
        How rankings work <ArrowRightIcon className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
