/**
 * Places policy (checked 2026-10-25): Places data shown without a Google map needs "Google Maps"
 * attribution; the text form is allowed where a logo does not fit. Unchanged wording on one line,
 * not translated, Roboto or sans-serif at weight 400, 12-16 px, gray #5E5E5E (white on dark).
 * Shown only on /admin/import, the one page that displays Google data.
 */
// DECISION-PENDING: text attribution instead of the Google Maps logo image (docs/OPEN-QUESTIONS.md).
export function GoogleMapsAttribution() {
  return (
    <p className="text-xs text-muted-foreground">
      Names, addresses and locations below: data from{" "}
      <span
        translate="no"
        className="[font-family:Roboto,sans-serif] text-xs font-normal whitespace-nowrap text-[#5E5E5E] dark:text-white"
      >
        Google Maps
      </span>
    </p>
  );
}
