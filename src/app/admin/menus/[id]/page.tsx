import Link from "next/link";
import { notFound } from "next/navigation";
import { MenuParseButton } from "@/components/admin/MenuParseButton";
import { MenuReviewRow } from "@/components/admin/MenuItemActions";
import { Forbidden } from "@/components/auth/Forbidden";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";
import { requirePageRole } from "@/server/auth";
import { getMenuUploadForAdmin } from "@/server/services/menu.service";

// "Parse now" reads the photo inside this page's server action.
export const maxDuration = 300;

const dateTime = new Intl.DateTimeFormat("en-PK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Karachi",
});

type Data = NonNullable<Awaited<ReturnType<typeof getMenuUploadForAdmin>>>;
type Item = Data["matched"][number];

function ItemLine({ item }: { item: Item }) {
  return (
    <span>
      <span className="font-medium">{item.rawName}</span>
      <span className="text-muted-foreground">
        {item.rawPrice !== null ? ` · ${formatPrice(item.rawPrice)}` : ""}
        {item.rawSection ? ` · ${item.rawSection}` : ""}
      </span>
    </span>
  );
}

export default async function AdminMenuUploadPage({ params }: PageProps<"/admin/menus/[id]">) {
  const { id } = await params;
  const user = await requirePageRole("ADMIN", `/admin/menus/${id}`);
  if (!user) return <Forbidden />;

  const data = await getMenuUploadForAdmin(user, id);
  if (!data) notFound();
  const { upload, photoUrl } = data;
  const r = upload.restaurant;
  const canParse = upload.status === "PENDING" || upload.status === "FAILED";

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href={`/admin/menus?status=${upload.status}`} className="text-sm underline">
          ← Menu photos
        </Link>
        <h1 className="text-2xl font-bold">
          {r.name}
          <span className="text-base font-normal text-muted-foreground">
            {" "}
            · {r.area?.name ?? "no area"}, {r.city.name}
          </span>
        </h1>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">{upload.status.toLowerCase()}</Badge>
          <span className="text-muted-foreground">
            {dateTime.format(upload.createdAt)} by {upload.uploadedBy.email}
          </span>
          <Link href={`/admin/restaurants/${r.id}`} className="underline">
            restaurant
          </Link>
          {r.status === "ACTIVE" && (
            <Link href={`/${r.city.slug}/r/${r.slug}`} className="underline">
              public page
            </Link>
          )}
        </p>
        {upload.error && (
          <p role="alert" className="text-sm text-destructive">
            {upload.error}
          </p>
        )}
      </header>

      {canParse &&
        (data.parsingEnabled ? (
          <div className="flex flex-col gap-1">
            <MenuParseButton
              uploadId={upload.id}
              label={upload.status === "FAILED" ? "Parse again" : "Parse now"}
            />
            <p className="text-sm text-muted-foreground">
              Read in the last 24 hours: {data.parsesToday} of {data.dailyCap}.
            </p>
          </div>
        ) : (
          <p role="status" className="rounded-lg border px-3 py-2 text-sm">
            Reading menus is not set up (ANTHROPIC_API_KEY and ANTHROPIC_VISION_MODEL).
          </p>
        ))}

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-label="Photo" className="md:sticky md:top-4 md:self-start">
          {photoUrl ? (
            <a href={photoUrl} target="_blank" rel="noopener noreferrer">
              {/* A private photo through a 10-minute signed link; never public. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt={`Menu photo of ${r.name}`}
                className="w-full rounded-lg border"
              />
            </a>
          ) : (
            <p className="text-sm">Photo storage is not set up.</p>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="review" className="flex flex-col gap-2">
            <h2 id="review" className="text-lg font-semibold">
              Needs review ({data.needsReview.length})
            </h2>
            <ul className="flex flex-col divide-y rounded-lg border">
              {data.needsReview.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 p-3 text-sm">
                  <ItemLine item={item} />
                  {item.review && item.review.status === "OPEN" ? (
                    <MenuReviewRow
                      reviewItemId={item.review.id}
                      fingerprint={item.review.fingerprint}
                      defaultName={item.rawName}
                      suggestions={item.review.suggestions}
                      dishes={data.dishes}
                      categories={data.categories}
                    />
                  ) : (
                    <span className="text-muted-foreground">No open review item.</span>
                  )}
                </li>
              ))}
              {data.needsReview.length === 0 && (
                <li className="p-3 text-sm">Nothing waits for a decision.</li>
              )}
            </ul>
          </section>

          <section aria-labelledby="matched" className="flex flex-col gap-2">
            <h2 id="matched" className="text-lg font-semibold">
              Matched ({data.matched.length})
            </h2>
            <ul className="flex flex-col divide-y rounded-lg border">
              {data.matched.map((item) => (
                <li key={item.id} className="flex flex-col gap-0.5 p-3 text-sm">
                  <ItemLine item={item} />
                  <span className="text-muted-foreground">
                    → {item.matchedDish?.name ?? "?"} · {item.matchMethod.toLowerCase()}{" "}
                    {item.matchConfidence?.toFixed(2)}
                    {item.variantTags.length > 0 ? ` · ${item.variantTags.join(", ")}` : ""}
                  </span>
                </li>
              ))}
              {data.matched.length === 0 && <li className="p-3 text-sm">None yet.</li>}
            </ul>
          </section>

          <section aria-labelledby="ignored" className="flex flex-col gap-2">
            <h2 id="ignored" className="text-lg font-semibold">
              Ignored ({data.ignored.length})
            </h2>
            <ul className="flex flex-col divide-y rounded-lg border">
              {data.ignored.map((item) => (
                <li key={item.id} className="p-3 text-sm">
                  <ItemLine item={item} />
                </li>
              ))}
              {data.ignored.length === 0 && <li className="p-3 text-sm">None.</li>}
            </ul>
          </section>

          {upload.parses.length > 0 && (
            <section aria-labelledby="parses" className="flex flex-col gap-2">
              <h2 id="parses" className="text-lg font-semibold">
                Parse attempts
              </h2>
              <ul className="flex flex-col gap-1 text-sm">
                {upload.parses.map((p) => (
                  <li key={p.id}>
                    {dateTime.format(p.startedAt)} · {p.trigger} · {p.model} ·{" "}
                    {p.ok === null ? "running" : p.ok ? "ok" : `failed: ${p.error}`} ·{" "}
                    {p.inputTokens + p.matchInputTokens} in / {p.outputTokens + p.matchOutputTokens}{" "}
                    out tokens ({p.matchCalls} matcher call{p.matchCalls === 1 ? "" : "s"})
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
