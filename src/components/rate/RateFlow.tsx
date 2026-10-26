"use client";

// The rating flow (docs/01 D4/D5, docs/08 Phase 3): restaurant → dish → score → done, four taps
// after typing the search. Each step lives in the URL (?city=&r=&d=), so the back button, a sign-in
// return and an edit from /me all open at the right step.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { SignInButton } from "@/components/auth/SignInButton";
import { Button } from "@/components/ui/button";
import { describeActionError } from "@/components/admin/action-error";
import { myRatingAction, submitRatingAction } from "@/server/actions/rating";
import type { RatingResult } from "@/server/services/rating.service";
import type { RatePageData, RateRestaurant } from "@/server/services/rate-page.service";
import { PanelLocationButton } from "./PanelLocationButton";
import { PhotoPicker } from "./PhotoPicker";
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

const tap = "min-h-11 rounded-lg border px-3 text-base";
const chip = `${tap} bg-background active:bg-muted aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground`;

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
  const [restaurant, setRestaurant] = useState<RateRestaurant | null>(data.restaurant);
  const [dish, setDish] = useState<DishRef | null>(data.dish);
  const [existing, setExisting] = useState<Existing | null>(data.existing);
  const [result, setResult] = useState<RatingResult | null>(null);
  // While a picked restaurant's own dishes load, its dish step shows neither list, so no chip moves
  // under the diner's finger when "On the menu here" arrives. Keyed by slug: a slower answer for
  // a restaurant picked before never clears the placeholder of the one on screen.
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [seen] = useState(() => initialSeen(data));
  const city = data.cities.find((c) => c.slug === citySlug) ?? data.cities[0];
  const step = result ? "done" : !restaurant ? "restaurant" : !dish ? "dish" : "score";
  const move = useCallback(
    (next: { restaurant: RateRestaurant | null; dish: DishRef | null; city?: string }) => {
      const nextCity = next.city ?? next.restaurant?.citySlug ?? citySlug;
      remember(seen, next.restaurant, next.dish);
      setCitySlug(nextCity);
      setRestaurant(next.restaurant);
      setDish(next.dish);
      setResult(null);
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
      setResult(null);
      setExisting(null); // the effect below loads the one for this entry
      // The first entry (/rate from the home page or /me) names no city: the server's default.
      setCitySlug(c && data.cities.some((x) => x.slug === c) ? c : data.citySlug);
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
  }, [data.cities, seen]);

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
      {step === "restaurant" && (
        <RestaurantStep
          cities={data.cities}
          citySlug={city?.slug ?? ""}
          signedIn={data.signedIn}
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
          signedIn={data.signedIn}
          isPanel={data.isPanel}
          photosEnabled={data.photosEnabled}
          callbackUrl={rateUrl(citySlug, restaurant, dish)}
          onChangeRestaurant={() => move({ restaurant: null, dish: null })}
          onChangeDish={() => move({ restaurant, dish: null })}
          onDone={(res) => {
            // Saved either way; the thank-you step only if the diner is still on this rating's
            // entry (a slow save must not replace a step they went back or forward to).
            const now = new URLSearchParams(window.location.search);
            if (now.get("r") !== res.restaurant.slug || now.get("d") !== res.dish.slug) return;
            setResult(res);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
      {step === "done" && result && (
        <DoneStep
          result={result}
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
  onCity,
  onPick,
}: {
  cities: RatePageData["cities"];
  citySlug: string;
  signedIn: boolean;
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
    <section aria-labelledby="step-restaurant" className="flex flex-col gap-3">
      <h2 id="step-restaurant" className="text-lg font-semibold">
        Where did you eat?
      </h2>
      <div className="flex gap-2" role="group" aria-label="City">
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
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Butt Karahi"
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 rounded-lg border border-input bg-transparent px-3 text-base"
        />
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
              className="flex min-h-11 w-full flex-col items-start rounded-lg border px-3 py-2 text-left active:bg-muted"
            >
              <span className="text-base font-medium">{hit.name}</span>
              <span className="text-sm text-muted-foreground">
                {[hit.area, hit.address].filter(Boolean).join(" · ")}
              </span>
            </button>
          </li>
        ))}
        {hits && hits.length === 0 && (
          <li className="text-sm">No restaurant found in {city?.name}.</li>
        )}
      </ul>
      {city && <SuggestRestaurant city={city} signedIn={signedIn} defaultName={q.trim()} />}
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
      <RestaurantHeader restaurant={restaurant} onChange={onChangeRestaurant} />
      <h2 id="step-dish" className="text-lg font-semibold">
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
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. karahi, kadai, nihari"
          autoComplete="off"
          className="h-11 rounded-lg border border-input bg-transparent px-3 text-base"
        />
      </label>
      {found && (
        <ul aria-live="polite" className="flex flex-wrap gap-2">
          {found.map((d) => (
            <li key={d.id}>
              <button type="button" className={chip} onClick={() => onPick(d)}>
                {d.name}
              </button>
            </li>
          ))}
          {found.length === 0 && <li className="text-sm">No dish matches “{q.trim()}”.</li>}
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
                  {d.name}
                  <span className="ml-1 text-sm text-muted-foreground">
                    {d.votes > 0 ? `· ${d.votes} vote${d.votes === 1 ? "" : "s"}` : ""}
                  </span>
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
                {d.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function RestaurantHeader({
  restaurant,
  onChange,
}: {
  restaurant: RateRestaurant;
  onChange: () => void;
}) {
  return (
    <p className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
      <span>
        <span className="font-medium">{restaurant.name}</span>
        {restaurant.area && (
          <span className="text-sm text-muted-foreground"> · {restaurant.area}</span>
        )}
      </span>
      <button type="button" onClick={onChange} className="min-h-11 text-sm underline">
        Change
      </button>
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
  signedIn,
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
  signedIn: boolean;
  isPanel: boolean;
  photosEnabled: boolean;
  callbackUrl: string;
  onChangeRestaurant: () => void;
  onChangeDish: () => void;
  onDone: (result: RatingResult) => void;
}) {
  const [score, setScore] = useState<number | null>(existing?.score ?? null);
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

  // An earlier rating found after the step opened fills the form, unless the user already started.
  useEffect(() => {
    if (!existing || touched.current) return;
    setScore(existing.score);
    setSubs({ taste: existing.taste, portion: existing.portion, value: existing.value });
    setComment(existing.comment ?? "");
    setPhotoPath(existing.photoPath);
  }, [existing]);

  function submit() {
    if (score === null) return;
    startTransition(async () => {
      let res;
      try {
        res = await submitRatingAction({
          restaurantId: restaurant.id,
          dishId: dish.id,
          score,
          ...Object.fromEntries(Object.entries(subs).filter(([, v]) => v !== null)),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
          ...(photoPath ? { photoPath } : {}),
        });
      } catch {
        setError("The rating did not reach the server. Check the connection and try again.");
        return;
      }
      if (res.error) {
        setError(describeActionError(res.error));
        return;
      }
      onDone(res.data);
    });
  }

  return (
    <section aria-labelledby="step-score" className="flex flex-col gap-4">
      <RestaurantHeader restaurant={restaurant} onChange={onChangeRestaurant} />
      <p className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
        <span className="font-medium">{dish.name}</span>
        <button type="button" onClick={onChangeDish} className="min-h-11 text-sm underline">
          Change
        </button>
      </p>
      <h2 id="step-score" className="text-lg font-semibold">
        How was it?
      </h2>
      {existing && (
        <p className="text-sm">
          You rated this {existing.score}/10 before; your new rating replaces it.
          {existing.status === "HELD" ? " It is under review." : ""}
          {existing.status === "HIDDEN"
            ? " A moderator hid it, so it does not count, and an update stays hidden."
            : ""}
        </p>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Your score, 1 to 10</legend>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={score === n}
              aria-label={`${n} out of 10`}
              onClick={() => {
                touched.current = true;
                setScore(n);
              }}
              className={`${chip} h-12 text-lg font-semibold`}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <details className="rounded-lg border px-3 py-2">
        <summary className="min-h-11 cursor-pointer py-2 text-base">Add details (optional)</summary>
        <div className="flex flex-col gap-4 pb-2">
          {SUB_SCORES.map(([key, label]) => (
            <fieldset key={key} className="flex flex-col gap-1">
              <legend className="text-sm font-medium">{label}, 1 to 5</legend>
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
                    className={chip}
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
              className="rounded-lg border border-input bg-transparent px-3 py-2 text-base"
            />
            <span className="text-xs font-normal text-muted-foreground">{comment.length}/280</span>
          </label>
          {photosEnabled && signedIn && (
            <PhotoPicker
              current={photoPath}
              onUploaded={(path) => {
                touched.current = true;
                setPhotoPath(path);
              }}
              onBusy={setUploading}
            />
          )}
        </div>
      </details>

      {isPanel && signedIn && <PanelLocationButton restaurantId={restaurant.id} />}

      {signedIn ? (
        <Button
          type="button"
          onClick={submit}
          disabled={score === null || pending || uploading}
          className="h-12 text-base"
        >
          {pending ? "Saving…" : existing ? "Update rating" : "Submit rating"}
        </Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-sm">Sign in to save your rating. You will come back to this step.</p>
          <SignInButton callbackURL={callbackUrl} />
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

function DoneStep({
  result,
  cityName,
  onSameRestaurant,
  onElsewhere,
}: {
  result: RatingResult;
  cityName: string;
  onSameRestaurant: () => void;
  onElsewhere: () => void;
}) {
  const votes = `${result.votes} vote${result.votes === 1 ? "" : "s"}`;
  return (
    <section aria-labelledby="step-done" className="flex flex-col gap-4" role="status">
      <h2 id="step-done" className="text-lg font-semibold">
        Thanks for rating!
      </h2>
      <p className="text-base">
        {result.dish.name} at {result.restaurant.name}
      </p>
      {result.status === "HIDDEN" ? (
        <p>Saved, but it does not count: a moderator hid your rating of this dish.</p>
      ) : result.held ? (
        <p>Your rating is under review. It counts once a moderator has checked it.</p>
      ) : result.eligible && result.score !== null ? (
        <p className="text-xl font-semibold">
          {result.score.toFixed(1)} · {votes}
          {result.rank !== null && (
            <span className="block text-base font-normal">
              #{result.rank} in {cityName}
              {result.mode === "bootstrap" ? " (early rankings)" : ""}
            </span>
          )}
        </p>
      ) : (
        <p>
          {votes} so far. Not enough votes yet: needs {result.ratingsNeeded} more rating
          {result.ratingsNeeded === 1 ? "" : "s"} to rank.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Button type="button" onClick={onSameRestaurant} className="h-12 text-base">
          Rate another dish here
        </Button>
        <Button type="button" variant="outline" onClick={onElsewhere} className="h-12 text-base">
          Rate somewhere else
        </Button>
        <Link href="/me" className="min-h-11 py-3 text-center underline">
          My ratings
        </Link>
      </div>
    </section>
  );
}
