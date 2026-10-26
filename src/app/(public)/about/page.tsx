import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "About – DishRank",
  description:
    "DishRank ranks restaurants in Islamabad and Rawalpindi dish by dish, from diners' own ratings.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-8 text-base">
      <h1 className="text-2xl font-bold">About DishRank</h1>
      <p>
        The best place for Chicken Karahi is rarely the best place for biryani. DishRank asks diners
        to rate one dish at a time, from 1 to 10, and ranks restaurants for each dish separately. A
        restaurant never gets one overall score.
      </p>
      <p>
        We start in Islamabad and Rawalpindi with a short list of popular dishes. Only dishes from
        that list can be rated, so &quot;karahi&quot;, &quot;kadai&quot; and &quot;karhai&quot; all
        end up in the same ranking.
      </p>
      <p>
        Rankings come only from ratings given on DishRank. Each restaurant listing is checked by a
        person before it appears. Read{" "}
        <Link href="/how-rankings-work" className="underline">
          how rankings work
        </Link>{" "}
        and{" "}
        <Link href="/about/data" className="underline">
          where our data comes from
        </Link>
        .
      </p>
      <p>
        Ratings are opinions, not facts about a restaurant. If something looks wrong, use the{" "}
        <Link href="/dispute" className="underline">
          dispute page
        </Link>
        .
      </p>
    </main>
  );
}
