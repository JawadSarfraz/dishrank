import Image from "next/image";

/**
 * Places policies (checked 2026-10-25): Places data shown without a Google map needs the Google
 * Maps logo, Google's own file unmodified (public/attribution: the non-outlined gray logo for a
 * plain background, from Google_Maps_Attribution_Assets.zip), 16-19 dp high, with clear space of
 * 10 dp left, right and top and 5 dp at the bottom, labelled "Google Maps", in the same container
 * as the data: each result's Google block on /admin/import, the one page that displays Google data.
 */
export function GoogleMapsAttribution() {
  return (
    <div className="flex flex-wrap items-center text-xs text-muted-foreground">
      <span>From</span>
      <span className="inline-flex px-[10px] pt-[10px] pb-[5px]">
        <Image
          src="/attribution/google-maps-logo-gray.svg"
          alt="Google Maps"
          width={98}
          height={18}
          unoptimized
        />
      </span>
    </div>
  );
}
