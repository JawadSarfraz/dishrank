// The top of a dish page (spec §5, §4 "No-photo tile"). Without a dish photo (the usual case) a band
// in the dish's tile colour carries the round Back and Share buttons, the breadcrumb and the H1, all
// in white; with a photo, the 232 px photo carries only the buttons and the breadcrumb and H1 go into
// the white sheet below (DishTitle). The sheet overlaps either by 28 px. The whole header steps aside
// in rate mode (data-rate-hide). Server component; only the Share button is client code.
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { DishMedia } from "@/components/dish/DishMedia";
import { ShareButton } from "@/components/ranking/ShareButton";
import { ButtonLink } from "@/components/ui/button-link";

type Place = { slug: string; name: string };
type Share = { title: string; text: string; path: string; label: string };

/** "Islamabad › Chicken Karahi": on the tile in white, in the sheet muted with a brand-dark link. */
function Breadcrumb({ city, dish, onTile }: { city: Place; dish: Place; onTile: boolean }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-[13px] leading-[18px]",
        onTile ? "text-white" : "text-muted-foreground",
      )}
    >
      <Link
        href={`/${city.slug}`}
        className={cn(
          // 44 px tap height without growing the 18 px line.
          "-my-[13px] inline-flex min-h-11 items-center underline-offset-2",
          onTile
            ? "font-bold text-white underline hover:text-white/85"
            : "font-semibold text-brand-dark hover:text-brand-press hover:underline",
        )}
      >
        {city.name}
      </Link>
      <span aria-hidden="true">›</span>
      <span>{dish.name}</span>
    </nav>
  );
}

const H1 =
  "font-display text-[32px] leading-[34px] font-extrabold tracking-[-0.02em] text-balance break-anywhere";

/** The breadcrumb, an optional line (the status badge) and the H1, for the sheet of a photo page. */
export function DishTitle({
  city,
  dish,
  title,
  badge,
}: {
  city: Place;
  dish: Place;
  title: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <Breadcrumb city={city} dish={dish} onTile={false} />
      {badge}
      <h1 className={H1}>{title}</h1>
    </div>
  );
}

export function DishHeader({
  city,
  dish,
  title,
  share,
  photo,
}: {
  city: Place;
  dish: Place;
  title: string;
  share: Share;
  /** hasDishPhoto(dish.slug): the photo layout, with the title in the sheet (DishTitle). */
  photo: boolean;
}) {
  const buttons = (
    <div className="relative flex items-center justify-between">
      <ButtonLink
        href={`/${city.slug}`}
        variant="round"
        size="icon"
        aria-label={`Back to ${city.name}`}
        className="shadow-float"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-[22px]" />
      </ButtonLink>
      <ShareButton
        appearance="round"
        city={city.slug}
        dish={dish.slug}
        title={share.title}
        text={share.text}
        path={share.path}
        label={share.label}
      />
    </div>
  );

  if (photo) {
    return (
      <div data-rate-hide="">
        <DishMedia
          slug={dish.slug}
          slot="header"
          priority
          className="h-58 shrink-0 px-3 pt-3 sm:rounded-t-sheet"
        >
          {buttons}
        </DishMedia>
      </div>
    );
  }
  return (
    <div data-rate-hide="">
      <DishMedia
        slug={dish.slug}
        slot="header"
        className="flex shrink-0 flex-col px-4 pt-3 pb-11 text-white sm:rounded-t-sheet sm:px-6"
      >
        {buttons}
        <div className="relative mt-4">
          <Breadcrumb city={city} dish={dish} onTile />
        </div>
        <h1 className={cn(H1, "relative mt-2 max-w-[270px] sm:max-w-md")}>{title}</h1>
      </DishMedia>
    </div>
  );
}
