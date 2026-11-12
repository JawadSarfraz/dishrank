"use client";

// "Rate the places you know" on a dish page (spec §4, §5). The page stays static: the list and its
// code load only when it is opened, and ask the server who is looking. A signed-out visitor sees the
// same list and signs in after tapping a score (QuickRatePanel). The server's shuffle seed comes
// along, so the contenders keep the order the page showed.
//
// Opening it is "rate mode": a screen of its own over the page (body[data-rate-mode] hides the tab
// bar and the page's [data-rate-hide] parts, globals.css), with a back arrow, the phone's back
// button and Escape to leave it. When the Primary button scrolls out of view, it comes back as a bar
// fixed above the tab bar.
import { ArrowLeftIcon, StarIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RateSkeleton } from "@/components/rate/RateSkeleton";
import { Button } from "@/components/ui/button";

const OPEN_PARAM = "rate";
const HEADING_ID = "quick-rate";

const QuickRatePanel = dynamic(() => import("./QuickRatePanel"), {
  ssr: false,
  loading: () => <RateSkeleton />,
});

export function QuickRate({
  citySlug,
  dishSlug,
  seed,
  helper = "One tap per place, 1 to 10. Sirf wahan rate karein jahan khaya ho.",
  children,
}: {
  citySlug: string;
  dishSlug: string;
  seed: string;
  /** The line under the button; ranked pages may ask their own question. */
  helper?: React.ReactNode;
  /** The ranking, the waiting list and the contenders: the page under the rate screen. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<{ dish: string; city: string } | null>(null);
  // The button is above the screen (scrolled past) / the footer is in view: the repeat bar shows
  // only for the first and not the second, so it never sits on the page's last lines.
  const [past, setPast] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const trigger = useRef<HTMLDivElement>(null);
  const triggerButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // An entry pushed on open, so the phone's back button leaves rate mode, not the page.
  const pushed = useRef(false);
  const closing = useRef<{ refresh: boolean } | null>(null);
  const saved = useRef(0);
  const scrollY = useRef(0);

  const openRate = useCallback(() => {
    scrollY.current = window.scrollY;
    window.history.pushState(null, "", window.location.href);
    pushed.current = true;
    saved.current = 0;
    setOpen(true);
  }, []);

  const finish = useCallback(
    (refresh: boolean) => {
      setOpen(false);
      // Saved scores revalidate the page; this fetches the new numbers for the lists under it.
      if (refresh) router.refresh();
    },
    [router],
  );

  const close = useCallback(
    (refresh: boolean) => {
      if (pushed.current) {
        pushed.current = false;
        closing.current = { refresh };
        window.history.back(); // the popstate below finishes
        return;
      }
      finish(refresh);
    },
    [finish],
  );

  useEffect(() => {
    function onPop() {
      if (closing.current) {
        const { refresh } = closing.current;
        closing.current = null;
        finish(refresh);
      } else if (pushed.current) {
        pushed.current = false;
        finish(saved.current > 0);
      }
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [finish]);

  // From an invite link, or from "Rate more places": open the list once, and take the marker out
  // of the URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(OPEN_PARAM)) return;
    url.searchParams.delete(OPEN_PARAM);
    window.history.replaceState(null, "", url);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once after load
    openRate();
  }, [openRate]);

  // Rate mode: no tab bar, no page parts, no page scroll; the rest of the page is inert.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    body.dataset.rateMode = "open";
    const overflow = body.style.overflow;
    body.style.overflow = "hidden";
    const made: Element[] = [];
    for (const el of Array.from(body.children)) {
      if (el.hasAttribute("data-rate-screen") || el.hasAttribute("inert")) continue;
      if (el.tagName === "SCRIPT") continue;
      el.setAttribute("inert", "");
      made.push(el);
    }
    heading.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(saved.current > 0);
    }
    window.addEventListener("keydown", onKey);
    const back = scrollY.current;
    const button = triggerButton.current;
    return () => {
      delete body.dataset.rateMode;
      body.style.overflow = overflow;
      for (const el of made) el.removeAttribute("inert");
      window.removeEventListener("keydown", onKey);
      window.scrollTo({ top: back });
      button?.focus({ preventScroll: true });
    };
  }, [open, close]);

  // The repeat bar: shown once the button has scrolled up and out of view.
  useEffect(() => {
    const el = trigger.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    io.observe(el);
    const footer = document.querySelector("footer");
    const end = footer
      ? new IntersectionObserver(([entry]) => setAtEnd(entry.isIntersecting), {
          // Under the tab bar and the repeat bar it is not in view yet.
          rootMargin: "0px 0px -160px 0px",
        })
      : null;
    if (footer) end?.observe(footer);
    return () => {
      io.disconnect();
      end?.disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col gap-7">
      <div ref={trigger} data-rate-hide className="flex flex-col gap-2">
        <Button
          ref={triggerButton}
          type="button"
          variant="cta"
          size="xl"
          className="w-full"
          aria-expanded={open}
          onClick={openRate}
        >
          <StarIcon aria-hidden="true" className="fill-current" />
          Rate the places you know
        </Button>
        {helper && (
          <p className="text-center text-[13px] leading-[18px] text-muted-foreground">{helper}</p>
        )}
      </div>

      {children && (
        <div data-rate-hide className="contents">
          {children}
        </div>
      )}

      {past && !atEnd && !open && (
        <div className="fixed inset-x-0 bottom-(--tabbar-height) z-30 border-t bg-card shadow-[0_-6px_16px_rgba(27,20,16,0.06)] lg:bottom-0 lg:pb-[env(safe-area-inset-bottom,0px)]">
          <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6">
            <Button type="button" variant="cta" size="lg" className="w-full" onClick={openRate}>
              <StarIcon aria-hidden="true" className="fill-current" />
              Rate the places you know
            </Button>
          </div>
        </div>
      )}

      {open &&
        createPortal(
          <div
            data-rate-screen
            role="dialog"
            aria-modal="true"
            aria-labelledby={HEADING_ID}
            className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background text-foreground"
          >
            <div className="mx-auto flex min-h-full w-full max-w-xl flex-col pt-[env(safe-area-inset-top,0px)]">
              <div className="flex min-h-14 items-center gap-1 pr-4 pl-1.5">
                <Button
                  type="button"
                  variant="round"
                  size="icon"
                  aria-label={meta ? `Back to ${meta.dish}` : "Back"}
                  onClick={() => close(saved.current > 0)}
                >
                  <ArrowLeftIcon aria-hidden="true" className="size-[22px]" strokeWidth={2.2} />
                </Button>
                {meta && (
                  <span className="min-w-0 text-sm leading-5 font-semibold text-muted-foreground">
                    {meta.dish} · {meta.city}
                  </span>
                )}
              </div>
              <div className="flex flex-col px-4 pt-1 pb-6">
                {/* Styled as the page title; an h2 because the dish page has its h1. */}
                <h2
                  ref={heading}
                  id={HEADING_ID}
                  tabIndex={-1}
                  className="font-display text-[26px] leading-[30px] font-extrabold tracking-[-0.015em] text-balance outline-none"
                >
                  Rate the places you know
                </h2>
                <QuickRatePanel
                  citySlug={citySlug}
                  dishSlug={dishSlug}
                  seed={seed}
                  onMeta={setMeta}
                  onSaved={(count) => {
                    saved.current = count;
                  }}
                  onDone={() => close(saved.current > 0)}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
