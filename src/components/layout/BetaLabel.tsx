// SITE_MODE=beta (docs/10): a small label at the top of every page.
export function BetaLabel() {
  return (
    <p className="mx-auto w-full max-w-xl px-4 pt-3 text-xs">
      <span className="rounded-full border px-2 py-0.5 font-medium">Beta</span>
    </p>
  );
}
