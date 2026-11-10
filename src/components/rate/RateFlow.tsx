"use client";

// The rating flow (docs/01 D4/D5, docs/08 Phase 3): restaurant → dish → score → done, four taps
// after typing the search. Each step lives in the URL (?city=&r=&d=), so the back button, a sign-in
// return and an edit from /me all open at the right step. A score tapped before signing in lives
// there too (?score=), so it is filled in afterwards and one tap submits it.
import { CheckIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { DishIcon } from "@/components/brand/DishIcon";
import { SignInButton } from "@/components/auth/SignInButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Disclosure } from "@/components/ui/disclosure";
import { describeActionError } from "@/components/admin/action-error";
import { ScoreBadge } from "@/components/ranking/ScoreBadge";
import { ShareButton } from "@/components/ranking/ShareButton";
import { BRAND } from "@/lib/brand";
import { formatAddress, formatNeeded, formatScore, formatVotes } from "@/lib/format";
import { withPendingScore } from "@/lib/pending-score";
import { PWA_EVENTS, noteRating } from "@/lib/pwa-prompt";
import { myRatingAction, submitRatingAction } from "@/server/actions/rating";
import type { RatingResult } from "@/server/services/rating.service";
import type { RatePageData, RateRestaurant } from "@/server/services/rate-page.service";
import { PanelLocationButton } from "./PanelLocationButton";
import { PhotoPicker } from "./PhotoPicker";
import { Steps } from "./Steps";
import { ProposeDish, SuggestRestaurant } from "./SuggestForms";

type DishRef = { id: string; slug: string; name: string };
type Existing = NonNullable<RatePageData["existing"]>;
type SearchHit = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  address: string | null;
};

const chip =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-base font-medium transition-colors active:bg-muted aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white";

function rateUrl(city: string, restaurant: RateRestaurant | null, dish: DishRef | null) {
  const params = new URLSearchParams({ city });
  if (restaurant) params.set("r", restaurant.slug);
  if (restaurant && dish) params.set("d", dish.slug);
  return `/rate?${params}`;
}

type Seen = { restaurants: Map<string, RateRestaurant>; dishes: Map<string, DishRef> };

function remember(seen: Seen, restaurant: RateRestaurant | null, dish: DishRef | null) {
  if (restaurant) {
    seen.restaurants.set(restaurant.slug, restaurant);
    for (const d of restaurant.dishes) {
      seen.dishes.set(d.slug, { id: d.id, slug: d.slug, name: d.name });
    }
  }
  if (dish) seen.dishes.set(dish.slug, dish);
}

/** Restaurants and dishes met in this tab, so back and forward can rebuild any step from its URL. */
function initialSeen(data: RatePageData): Seen {
  const seen: Seen = { restaurants: new Map(), dishes: new Map() };
  for (const d of data.launchDishes) seen.dishes.set(d.slug, d);
  remember(seen, data.restaurant, data.dish);
  return seen;
}

async function fetchRestaurant(slug: string): Promise<RateRestaurant | null> {
  const res = await fetch(`/api/v1/restaurants/${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  const { data } = (await res.json()) as {
    data: {
      restaurant: {
        id: string;
        slug: string;
        name: string;
        area: { name: string } | null;
        city: { slug: string };
      };
      dishes: { dish: DishRef; votes: number; score: number | null; rankInCity: number | null }[];
    };
  };
  return {
    id: data.restaurant.id,
    slug: data.restaurant.slug,
    name: data.restaurant.name,
    area: data.restaurant.area?.name ?? null,
    citySlug: data.restaurant.city.slug,
    dishes: data.dishes.map((d) => ({
      ...d.dish,
      votes: d.votes,
      score: d.score,
      rank: d.rankInCity,
    })),
  };
}

export function RateFlow({ data }: { data: RatePageData }) {
  const [citySlug, setCitySlug] = useState(data.citySlug);
  // The first entry's city: only that entry can lack ?city= (every later one is pushed with it),
  // and data.citySlug changes when a save revalidates the page.
  const [entryCity] = useState(data.citySlug);
  const [restaurant, setRestaurant] = useState<RateRestaurant | null>(data.restaurant);
  const [dish, setDish] = useState<DishRef | null>(data.dish);
  const [existing, setExisting] = useState<Existing | null>(data.existing);
  const [done, setDone] = useState<{ result: RatingResult; score: number } | null>(null);
  // While a picked restaurant's own dishes load, its dish step shows neither list, so no chip moves
  // under the diner's finger when "On the menu here" arrives. Keyed by slug: a slower answer for
  // a restaurant picked before never clears the placeholder of the one on screen.
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [seen] = useState(() => initialSeen(data));
  // Kept with the first entry's restaurant and dish: it must not fill the step of another one.
  const [pending] = useState(
    data.pendingScore === null
      ? null
      : { score: data.pendingScore, step: `${data.restaurant?.id}:${data.dish?.id}` },
  );
  const city = data.cities.find((c) => c.slug === citySlug) ?? data.cities[0];
  const step = done ? "done" : !restaurant ? "restaurant" : !dish ? "dish" : "score";
  const move = useCallback(
    (next: { restaurant: RateRestaurant | null; dish: DishRef | null; city?: string }) => {
      const nextCity = next.city ?? next.restaurant?.citySlug ?? citySlug;
      remember(seen, next.restaurant, next.dish);
      setCitySlug(nextCity);
      setRestaurant(next.restaurant);
      setDish(next.dish);
      setDone(null);
      setExisting(null);
      window.history.pushState(null, "", rateUrl(nextCity, next.restaurant, next.dish));
      window.scrollTo({ top: 0 });
    },
    [citySlug, seen],
  );

  // Browser back/forward: the URL decides the city, the restaurant and the dish.
  useEffect(() => {
    function onPop() {
      const params = new URLSearchParams(window.location.search);
      const c = params.get("city");
      const r = params.get("r");
      const d = params.get("d");
      setDone(null);
      setExisting(null); // the effect below loads the one for this entry
      // The first entry (/rate from the home page or /me) names no city: the server's default.
      setCitySlug(c && data.cities.some((x) => x.slug === c) ? c : entryCity);
      if (!r) {
        setRestaurant(null);
        setDish(null);
        return;
      }
      const known = seen.restaurants.get(r) ?? null;
      setRestaurant(known);
      setDish(d ? (seen.dishes.get(d) ?? null) : null);
      if (known) return;
      void fetchRestaurant(r)
        .then((found) => {
          if (!found) return;
          remember(seen, found, null);
          // Only if the diner is still on that entry.
          const now = new URLSearchParams(window.location.search);
          if (now.get("r") !== r) return;
          setRestaurant(found);
          const nd = now.get("d");
          setDish(nd ? (seen.dishes.get(nd) ?? null) : null);
        })
        .catch(() => {}); // offline: the diner stays on the search step and can search again
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [data.cities, entryCity, seen]);

  // A dish the user rated before is prefilled, and the button says "Update".
  useEffect(() => {
    if (!data.signedIn || !restaurant || !dish || existing) return;
    let live = true;
    void myRatingAction({ restaurantId: restaurant.id, dishId: dish.id }).then((res) => {
      if (live && res.data) setExisting(res.data);
    });
    return () => {
      live = false;
    };
  }, [data.signedIn, restaurant, dish, existing]);

  return (
    <div className="flex flex-col gap-5">
      {step !== "done" && <Steps current={step === "restaurant" ? 1 : step === "dish" ? 2 : 3} />}
      {step === "restaurant" && (
        <RestaurantStep
          cities={data.cities}
          citySlug={city?.slug ?? ""}
          signedIn={data.signedIn}
          suggestOpen={data.suggestOpen}
          onCity={(slug) => move({ restaurant: null, dish: null, city: slug })}
          onPick={(hit) => {
            // Show the dish step at once; the restaurant's own dishes arrive a moment later.
            const pending: RateRestaurant = { ...hit, citySlug: city?.slug ?? "", dishes: [] };
            move({ restaurant: pending, dish: null });
            setLoadingSlug(hit.slug);
            void fetchRestaurant(hit.slug)
              .then((found) => {
                if (!found) return;
                remember(seen, found, null);
                setRestaurant((cur) => (cur?.id === found.id ? found : cur));
              })
              .catch(() => {}) // offline: the launch dishes and the search still work
              .finally(() => setLoadingSlug((cur) => (cur === hit.slug ? null : cur)));
          }}
        />
      )}
      {step === "dish" && restaurant && (
        <DishStep
          restaurant={restaurant}
          loading={loadingSlug === restaurant.slug}
          launchDishes={data.launchDishes}
          signedIn={data.signedIn}
          backUrl={rateUrl(citySlug, restaurant, null)}
          onChangeRestaurant={() => move({ restaurant: null, dish: null })}
          onPick={(picked) => move({ restaurant, dish: picked })}
        />
      )}
      {step === "score" && restaurant && dish && (
        <ScoreStep
          key={`${restaurant.id}:${dish.id}`}
          restaurant={restaurant}
          dish={dish}
          existing={existing}
          pendingScore={pending?.step === `${restaurant.id}:${dish.id}` ? pending.score : null}
          signedIn={data.signedIn}
          userName={data.userName}
          isPanel={data.isPanel}
          photosEnabled={data.photosEnabled}
          callbackUrl={rateUrl(citySlug, restaurant, dish)}
          onChangeRestaurant={() => move({ restaurant: null, dish: null })}
          onChangeDish={() => move({ restaurant, dish: null })}
          onDone={(res, entry, score) => {
            // Saved either way; the thank-you step only if the diner is still on the entry the
            // save started from (a slow save must not replace a step they went back or forward to).
            if (window.location.href !== entry) return;
            setDone({ result: res, score });
            window.scrollTo({ top: 0 });
            // The install prompt may show after the second saved rating.
            noteRating();
            window.dispatchEvent(new Event(PWA_EVENTS.rated));
          }}
        />
      )}
      {step === "done" && done && (
        <DoneStep
          result={done.result}
          yourScore={done.score}
          replaced={existing !== null}
          cityName={city?.name ?? ""}
          onSameRestaurant={() => move({ restaurant, dish: null })}
          onElsewhere={() => move({ restaurant: null, dish: null })}
        />
      )}
    </div>
  );
}

function RestaurantStep({
  cities,
  citySlug,
  signedIn,
  suggestOpen,
  onCity,
  onPick,
}: {
  cities: RatePageData["cities"];
  citySlug: string;
  signedIn: boolean;
  /** Opened from "Missing one? Add it" on a dish page: the suggest form starts open. */
  suggestOpen: boolean;
  onCity: (slug: string) => void;
  onPick: (hit: SearchHit) => void;
}) {
  const [q, setQ] = useState("");
  // Results remember the query and city they answer, so a stale answer is never shown.
  const [results, setResults] = useState<{ key: string; hits: SearchHit[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const city = cities.find((c) => c.slug === citySlug);
  const text = q.trim();
  const key = `${citySlug}:${text}`;
  const hits = text.length >= 2 && results?.key === key ? results.hits : null;

  useEffect(() => {
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/restaurants/search?city=${encodeURIComponent(citySlug)}&q=${encodeURIComponent(text)}`,
          { signal: controller.signal },
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? "Search failed");
        setError(null);
        setResults({ key, hits: body.data as SearchHit[] });
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setError("Search is not working right now. Try again.");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, key, citySlug]);

  return (
    <section aria-labelledby="step-restaurant" className="flex flex-col gap-4">
      <h2 id="step-restaurant" className="text-3xl font-extrabold">
        Where did you eat?
      </h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="City">
        {cities.map((c) => (
          <button
            key={c.slug}
            type="button"
            className={chip}
            aria-pressed={c.slug === citySlug}
            onClick={() => onCity(c.slug)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Restaurant
        <span className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Butt Karahi"
            autoComplete="off"
            enterKeyHint="search"
            className="field h-12 pl-11 font-normal"
          />
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ul aria-live="polite" className="flex flex-col gap-2">
        {hits?.map((hit) => (
          <li key={hit.id}>
            <button
              type="button"
              onClick={() => onPick(hit)}
              className="flex min-h-14 w-full flex-col items-start justify-center rounded-xl border bg-card px-4 py-2 text-left shadow-card transition-colors hover:border-brand/40 active:bg-muted"
            >
              <span className="font-display text-lg leading-tight font-bold break-anywhere">
                {hit.name}
              </span>
              <span className="text-sm text-muted-foreground">
                {[hit.area, hit.address && formatAddress(hit.address)].filter(Boolean).join(" · ")}
              </span>
            </button>
          </li>
        ))}
        {hits && hits.length === 0 && (
          <li className="rounded-xl border border-dashed bg-card px-4 py-3 text-sm text-muted-foreground">
            No restaurant found in {city?.name}. Check the spelling, or suggest it below.
          </li>
        )}
      </ul>
      {city && (
        <SuggestRestaurant
          city={city}
          signedIn={signedIn}
          defaultName={q.trim()}
          defaultOpen={suggestOpen}
        />
      )}
    </section>
  );
}

function DishStep({
  restaurant,
  loading,
  launchDishes,
  signedIn,
  backUrl,
  onChangeRestaurant,
  onPick,
}: {
  restaurant: RateRestaurant;
  loading: boolean;
  launchDishes: DishRef[];
  signedIn: boolean;
  backUrl: string;
  onChangeRestaurant: () => void;
  onPick: (dish: DishRef) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ key: string; dishes: DishRef[] } | null>(null);
  const listed = new Set(restaurant.dishes.map((d) => d.id));
  const popular = launchDishes.filter((d) => !listed.has(d.id));
  const text = q.trim();
  const found = text.length >= 2 && results?.key === text ? results.dishes : null;

  useEffect(() => {
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/dishes?city=${encodeURIComponent(restaurant.citySlug)}&q=${encodeURIComponent(text)}`,
          { signal: controller.signal },
        );
        if (res.ok) setResults({ key: text, dishes: ((await res.json()).data as DishRef[]) ?? [] });
      } catch {
        // Aborted by the next keystroke, or offline: the chips above still work.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, restaurant.citySlug]);

  return (
    <section aria-labelledby="step-dish" className="flex flex-col gap-4">
      <Pill
        label="Restaurant"
        value={restaurant.name}
        detail={restaurant.area}
        onChange={onChangeRestaurant}
      />
      <h2 id="step-dish" className="text-3xl font-extrabold">
        What did you eat?
      </h2>
      {loading ? (
        <p role="status" className="min-h-24 text-sm text-muted-foreground">
          Loading this restaurant&apos;s dishes…
        </p>
      ) : (
        <DishChips restaurant={restaurant} popular={popular} onPick={onPick} />
      )}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Search all dishes
        <span className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. karahi, kadai, nihari"
            autoComplete="off"
            className="field h-12 pl-11 font-normal"
          />
        </span>
      </label>
      {found && (
        <ul aria-live="polite" className="flex flex-wrap gap-2">
          {found.map((d) => (
            <li key={d.id}>
              <button type="button" className={chip} onClick={() => onPick(d)}>
                <DishIcon slug={d.slug} size={18} />
                {d.name}
              </button>
            </li>
          ))}
          {found.length === 0 && (
            <li className="text-sm text-muted-foreground">No dish matches “{q.trim()}”.</li>
          )}
        </ul>
      )}
      <ProposeDish
        restaurantId={restaurant.id}
        signedIn={signedIn}
        callbackUrl={backUrl}
        defaultName={q.trim()}
      />
    </section>
  );
}

/** The restaurant's own dishes first, then the launch dishes it does not list. */
function DishChips({
  restaurant,
  popular,
  onPick,
}: {
  restaurant: RateRestaurant;
  popular: DishRef[];
  onPick: (dish: DishRef) => void;
}) {
  return (
    <>
      {restaurant.dishes.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">On the menu here</h3>
          <ul className="flex flex-wrap gap-2">
            {restaurant.dishes.map((d) => (
              <li key={d.id}>
                <button type="button" className={chip} onClick={() => onPick(d)}>
                  <DishIcon slug={d.slug} size={18} />
                  {d.name}
                  {d.votes > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      · {formatVotes(d.votes)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Popular dishes</h3>
        <ul className="flex flex-wrap gap-2">
          {popular.map((d) => (
            <li key={d.id}>
              <button type="button" className={chip} onClick={() => onPick(d)}>
                <DishIcon slug={d.slug} size={18} />
                {d.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** What was picked at an earlier step, with a "Change" button. */
function Pill({
  label,
  value,
  detail,
  onChange,
}: {
  label: string;
  value: string;
  detail?: string | null;
  onChange: () => void;
}) {
  return (
    <p className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2 shadow-card">
      <span className="flex min-w-0 flex-col">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="font-display text-base leading-tight font-bold break-anywhere">
          {value}
          {detail && (
            <span className="font-sans font-normal text-muted-foreground"> · {detail}</span>
          )}
        </span>
      </span>
      <Button type="button" variant="link" onClick={onChange} className="min-h-11 shrink-0">
        Change
      </Button>
    </p>
  );
}

const SUB_SCORES = [
  ["taste", "Taste"],
  ["portion", "Portion"],
  ["value", "Value for money"],
] as const;

function ScoreStep({
  restaurant,
  dish,
  existing,
  pendingScore,
  signedIn,
  userName,
  isPanel,
  photosEnabled,
  callbackUrl,
  onChangeRestaurant,
  onChangeDish,
  onDone,
}: {
  restaurant: RateRestaurant;
  dish: DishRef;
  existing: Existing | null;
  /** Tapped before signing in: it wins over an earlier rating's score. */
  pendingScore: number | null;
  signedIn: boolean;
  userName: string | null;
  isPanel: boolean;
  photosEnabled: boolean;
  callbackUrl: string;
  onChangeRestaurant: () => void;
  onChangeDish: () => void;
  /** `entry`: the address when the save started; `score`: what the diner gave. */
  onDone: (result: RatingResult, entry: string, score: number) => void;
}) {
  // What the diner tapped here, else a score tapped before signing in, else the earlier rating's.
  const [picked, setPicked] = useState<number | null>(null);
  const score = picked ?? pendingScore ?? existing?.score ?? null;
  const [subs, setSubs] = useState<Record<string, number | null>>({
    taste: existing?.taste ?? null,
    portion: existing?.portion ?? null,
    value: existing?.value ?? null,
  });
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [photoPath, setPhotoPath] = useState<string | null>(existing?.photoPath ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const touched = useRef(false);
  // Only a photo the diner picked or removed is sent; otherwise the server keeps the earlier one.
  const photoTouched = useRef(false);

  // An earlier rating found after the step opened fills the form, unless the user already started;
  // its photo always shows unless the diner changed the photo.
  useEffect(() => {
    if (!existing) return;
    if (!photoTouched.current) setPhotoPath(existing.photoPath);
    if (touched.current) return;
    setSubs({ taste: existing.taste, portion: existing.portion, value: existing.value });
    setComment(existing.comment ?? "");
  }, [existing]);

  function submit() {
    if (score === null) return;
    const entry = window.location.href;
    const given = score;
    startTransition(async () => {
      let res;
      try {
        res = await submitRatingAction({
          restaurantId: restaurant.id,
          dishId: dish.id,
          score: given,
          ...Object.fromEntries(Object.entries(subs).filter(([, v]) => v !== null)),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
          ...(photoPath ? { photoPath } : photoTouched.current ? { photoPath: null } : {}),
        });
      } catch {
        setError("The rating did not reach the server. Check the connection and try again.");
        return;
      }
      if (res.error) {
        setError(describeActionError(res.error));
        return;
      }
      onDone(res.data, entry, given);
    });
  }

  return (
    <section aria-labelledby="step-score" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Pill
          label="Restaurant"
          value={restaurant.name}
          detail={restaurant.area}
          onChange={onChangeRestaurant}
        />
        <Pill label="Dish" value={dish.name} onChange={onChangeDish} />
      </div>
      <h2 id="step-score" className="text-3xl font-extrabold">
        How was it?
      </h2>
      {existing && (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm">
          You rated this {existing.score}/10 before; your new rating replaces it.
          {existing.status === "HELD" ? " It is under review." : ""}
          {existing.status === "HIDDEN"
            ? " A moderator hid it, so it does not count, and an update stays hidden."
            : ""}
        </p>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Your score, 1 to 10</legend>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={score === n}
              aria-label={`${n} out of 10`}
              onClick={() => {
                touched.current = true;
                setPicked(n);
                // Signed out: into the address, for the move out of an in-app browser as well.
                if (!signedIn) {
                  const here = `${window.location.pathname}${window.location.search}`;
                  window.history.replaceState(null, "", withPendingScore(here, n));
                }
              }}
              className="min-h-14 rounded-xl border border-border bg-card font-display text-xl font-bold transition-[color,background-color,border-color,transform] active:translate-y-px aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white aria-pressed:shadow-[0_2px_0_var(--brand-ink)]"
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1 · wouldn&apos;t go back</span>
          <span>10 · best I&apos;ve had</span>
        </div>
      </fieldset>

      <Disclosure summary="Add details (optional)">
        <p className="-mt-1 text-sm text-muted-foreground">
          Taste, portion, value, a comment or a photo.
        </p>
        {SUB_SCORES.map(([key, label]) => (
          <fieldset key={key} className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">{label}, 1 to 5</legend>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={subs[key] === n}
                  aria-label={`${label} ${n} out of 5`}
                  onClick={() => {
                    touched.current = true;
                    setSubs((s) => ({ ...s, [key]: s[key] === n ? null : n }));
                  }}
                  className={`${chip} justify-center px-0 font-display`}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Comment
          <textarea
            value={comment}
            onChange={(e) => {
              touched.current = true;
              setComment(e.target.value);
            }}
            maxLength={280}
            rows={3}
            placeholder="What stood out? (no phone numbers or links)"
            className="field py-2 font-normal"
          />
          <span className="text-xs font-normal text-muted-foreground">{comment.length}/280</span>
        </label>
        {photosEnabled && signedIn && (
          <PhotoPicker
            current={photoPath}
            onUploaded={(path) => {
              touched.current = true;
              photoTouched.current = true;
              setPhotoPath(path);
            }}
            onBusy={setUploading}
          />
        )}
      </Disclosure>

      {isPanel && signedIn && <PanelLocationButton restaurantId={restaurant.id} />}

      {signedIn ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            onClick={submit}
            disabled={score === null || pending || uploading}
            className="w-full"
          >
            {pending ? "Saving…" : existing ? "Update rating" : "Submit rating"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {userName ? `Rating as ${userName} · ` : ""}one rating per dish here; you can change it
            later.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-card">
          <p className="text-sm">
            {score === null
              ? "Sign in to save your rating. You will come back to this step."
              : `Sign in to save your ${score}. You will come back here with it filled in.`}
          </p>
          <SignInButton
            callbackURL={score === null ? callbackUrl : withPendingScore(callbackUrl, score)}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

/** The one sentence about what the rating did to the list (owner, Part 3: from Direction B). */
function rankSentence(r: RatingResult, cityName: string) {
  const where = `for ${r.dish.name} in ${cityName}`;
  const votes = `from ${formatVotes(r.votes)}`;
  if (r.rank === null) return null;
  if (r.previousRank === null) {
    return `${r.restaurant.name} enters the list at #${r.rank} ${where}, ${votes}.`;
  }
  if (r.previousRank === r.rank) {
    return `${r.restaurant.name} stays #${r.rank} ${where}, now ${votes}.`;
  }
  const dir = r.rank < r.previousRank ? "moves up" : "moves";
  return `${r.restaurant.name} ${dir} from #${r.previousRank} to #${r.rank} ${where}, now ${votes}.`;
}

function DoneStep({
  result,
  yourScore,
  replaced,
  cityName,
  onSameRestaurant,
  onElsewhere,
}: {
  result: RatingResult;
  yourScore: number;
  replaced: boolean;
  cityName: string;
  onSameRestaurant: () => void;
  onElsewhere: () => void;
}) {
  const ranked = result.eligible && result.score !== null && result.rank !== null;
  const counted = !result.held && result.status !== "HIDDEN" && !result.stale;
  const restaurantPath = `/${result.restaurant.citySlug}/r/${result.restaurant.slug}`;
  const listPath = `/${result.restaurant.citySlug}/best-${result.dish.slug}`;
  const share = ranked
    ? {
        path: listPath,
        label: "Share this ranking",
        text: `${result.restaurant.name} is #${result.rank} for ${result.dish.name} in ${cityName} on ${BRAND.name} (${formatScore(result.score!)} · ${formatVotes(result.votes)})\n\n${BRAND.shareCall}`,
      }
    : {
        path: restaurantPath,
        label: `Share ${result.restaurant.name}`,
        text: `I rated ${result.dish.name} at ${result.restaurant.name} on ${BRAND.name}. Add yours:`,
      };
  const share_ = Math.min(1, result.votes / Math.max(result.minRaters, 1));

  return (
    <section aria-labelledby="step-done" role="status" className="flex flex-col gap-5">
      <div className="flex flex-col items-start gap-3">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand">
          <CheckIcon aria-hidden="true" className="size-7" strokeWidth={3} />
        </span>
        <h2 id="step-done" className="text-3xl font-extrabold">
          Thanks, your rating is in.
        </h2>
        <p className="text-base text-muted-foreground">
          {result.dish.name} at {result.restaurant.name}
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-card">
        <div className="flex items-center gap-4">
          <span
            className="font-display text-5xl leading-none font-extrabold tabular-nums"
            aria-label={`Your score ${yourScore} out of 10`}
          >
            {yourScore}
          </span>
          <span className="flex flex-col">
            <span className="font-medium">Your score</span>
            <span className="text-sm text-muted-foreground">
              {result.held
                ? "Under review"
                : result.status === "HIDDEN"
                  ? "Not counted"
                  : replaced
                    ? "Replaces your earlier rating"
                    : "Counts right away"}
            </span>
          </span>
        </div>

        {result.stale && !result.held ? (
          <p>Saved. Its score and rank will update in a moment.</p>
        ) : result.status === "HIDDEN" ? (
          <p>Saved, but it does not count: a moderator hid your rating of this dish.</p>
        ) : result.held ? (
          <p>
            Your rating is under review
            {result.heldReason === "COMMENT" ? " because of the comment" : ""}. It counts once a
            moderator has checked it.
          </p>
        ) : ranked ? (
          <div className="flex flex-col gap-3">
            <p>
              <span className="font-medium">What your rating did: </span>
              {rankSentence(result, cityName)} Your {yourScore} counts right away, and more than
              older votes.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ScoreBadge score={result.score!} votes={result.votes} size="lg" />
              {result.mode === "bootstrap" && <Badge>Early rankings</Badge>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div
              role="progressbar"
              aria-label={`${result.votes} of ${result.minRaters} raters`}
              aria-valuemin={0}
              aria-valuemax={result.minRaters}
              aria-valuenow={Math.min(result.votes, result.minRaters)}
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-brand" style={{ width: `${share_ * 100}%` }} />
            </div>
            <p>
              <span className="font-medium">
                {result.votes} of {result.minRaters} raters so far:
              </span>{" "}
              {result.restaurant.name}{" "}
              {formatNeeded(result.votes, result.minRaters, result.ratingsNeeded === 0)} for{" "}
              {result.dish.name}.
            </p>
            <p className="text-sm text-muted-foreground">
              Know someone who ate there? Share it and they can add theirs.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button type="button" size="lg" onClick={onSameRestaurant} className="w-full">
          Rate another dish here
        </Button>
        <ButtonLink
          variant="outline"
          href={`${listPath}?rate=1`}
          className="h-auto min-h-12 w-full py-2 whitespace-normal"
        >
          Rate more places for {result.dish.name}
        </ButtonLink>
        {counted && (
          <ShareButton
            city={result.restaurant.citySlug}
            dish={result.dish.slug}
            title={result.restaurant.name}
            text={share.text}
            path={share.path}
            label={share.label}
            className="h-12 w-full"
          />
        )}
        <div className="flex items-center justify-center gap-6 text-base">
          <Button type="button" variant="link" onClick={onElsewhere} className="min-h-11">
            Rate somewhere else
          </Button>
          <Link
            href="/me"
            className="inline-flex min-h-11 items-center font-medium text-brand underline-offset-4 hover:underline"
          >
            My ratings
          </Link>
        </div>
      </div>
    </section>
  );
}
