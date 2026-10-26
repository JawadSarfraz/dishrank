// City picker (server component): links, so it works without JavaScript.
import Link from "next/link";

export function CityPicker({
  cities,
  current,
}: {
  cities: { slug: string; name: string }[];
  current: string;
}) {
  return (
    <nav aria-label="Cities" className="flex flex-wrap gap-2">
      {cities.map((c) => (
        <Link
          key={c.slug}
          href={`/${c.slug}`}
          aria-current={c.slug === current ? "page" : undefined}
          className="inline-flex min-h-11 items-center rounded-full border px-4 text-base aria-[current=page]:border-foreground aria-[current=page]:font-semibold"
        >
          {c.name}
        </Link>
      ))}
    </nav>
  );
}
