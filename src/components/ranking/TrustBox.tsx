// "Why these ranks can be trusted" (spec §4 "Trust block"; home and city pages): the ink block. The
// rater count is the city's live threshold (4 in early rankings, 8 after them), never a constant
// typed here. Line one says only what is true of every rating: it was given here by a signed-in
// diner (the design's "a real person" claims more than sign-in can prove).
import { BanIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

export function TrustBox({ minRaters }: { minRaters: number }) {
  const points = [
    {
      icon: ShieldCheckIcon,
      text: `Every rating is given on ${BRAND.name} by a signed-in diner. Nothing paid, copied or generated.`,
    },
    {
      icon: UsersIcon,
      text: `A place joins the ranking once at least ${minRaters} diners have rated it.`,
    },
    { icon: BanIcon, text: "Rankings are never for sale." },
  ];
  return (
    <section
      aria-labelledby="trust"
      className="flex flex-col gap-3.5 rounded-block bg-ink p-5 text-white lg:gap-6 lg:rounded-sheet lg:p-10"
    >
      <h2
        id="trust"
        className="font-display text-xl leading-6 font-extrabold lg:text-[28px] lg:leading-8 lg:tracking-[-0.01em]"
      >
        Why these ranks can be trusted
      </h2>
      <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(280px,1fr))] lg:gap-x-8 lg:gap-y-6">
        {points.map(({ icon: Icon, text }) => (
          <li
            key={text}
            className="flex items-start gap-3 text-sm leading-5 text-trust-text lg:text-base lg:leading-6"
          >
            <Icon aria-hidden="true" className="size-5 shrink-0 text-white lg:size-6" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/how-rankings-work"
        className="inline-flex min-h-11 w-fit items-center text-sm leading-5 font-bold text-white underline underline-offset-[3px] hover:text-trust-text focus-visible:outline-white"
      >
        How rankings work
      </Link>
    </section>
  );
}
