import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, AdminList, AdminNote } from "@/components/admin/AdminPage";
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
        {item.romanName ? ` (${item.romanName})` : ""}
        {item.rawPrice !== null ? ` · ${formatPrice(item.rawPrice)}` : ""}
        {item.rawSection ? ` · ${item.rawSection}` : ""}
      </span>
    </span>
  );
}

const link = "font-medium text-brand underline-offset-4 hover:underline";

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
    <main className="flex flex-col gap-5">
      <Link
        href={`/admin/menus?status=${upload.status}`}
        className={`inline-flex min-h-11 w-fit items-center gap-1 text-sm ${link}`}
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" /> Menu photos
      </Link>
      <AdminHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {r.name}
            <Badge variant="outline">{upload.status.toLowerCase()}</Badge>
          </span>
        }
        help={
          <>
            {r.area?.name ?? "no area"}, {r.city.name} · {dateTime.format(upload.createdAt)} by{" "}
            {upload.uploadedBy?.email ?? "a deleted account"} ·{" "}
            <Link href={`/admin/restaurants/${r.id}`} className={link}>
              restaurant
            </Link>
            {r.status === "ACTIVE" && (
              <>
                {" · "}
                <Link href={`/${r.city.slug}/r/${r.slug}`} className={link}>
                  public page
                </Link>
              </>
            )}
          </>
        }
      />
      {upload.error && (
        <p role="alert" className="text-sm text-destructive">
          {upload.error}
        </p>
      )}

      {canParse &&
        (data.parsingEnabled ? (
          <div className="flex flex-wrap items-center gap-3">
            <MenuParseButton
              uploadId={upload.id}
              label={upload.status === "FAILED" ? "Parse again" : "Parse now"}
            />
            <p className="text-sm text-muted-foreground">
              Read in the last 24 hours: {data.parsesToday} of {data.dailyCap}.
            </p>
          </div>
        ) : (
          <AdminNote>
            Reading menus is not set up (ANTHROPIC_API_KEY and ANTHROPIC_VISION_MODEL).
          </AdminNote>
        ))}

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-label="Photo" className="md:sticky md:top-20 md:self-start">
          {photoUrl ? (
            <a href={photoUrl} target="_blank" rel="noopener noreferrer">
              {/* A private photo through a 10-minute signed link; never public. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt={`Menu photo of ${r.name}`}
                className="w-full rounded-xl border bg-card shadow-card"
              />
            </a>
          ) : (
            <AdminNote>Photo storage is not set up.</AdminNote>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="review" className="flex flex-col gap-2">
            <h2 id="review" className="text-lg font-bold">
              Needs review ({data.needsReview.length})
            </h2>
            <AdminList>
              {data.needsReview.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 px-4 py-3">
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
                <li className="px-4 py-3 text-muted-foreground">Nothing waits for a decision.</li>
              )}
            </AdminList>
          </section>

          <section aria-labelledby="matched" className="flex flex-col gap-2">
            <h2 id="matched" className="text-lg font-bold">
              Matched ({data.matched.length})
            </h2>
            <AdminList>
              {data.matched.map((item) => (
                <li key={item.id} className="flex flex-col gap-0.5 px-4 py-3">
                  <ItemLine item={item} />
                  <span className="text-muted-foreground">
                    → {item.matchedDish?.name ?? "?"} · {item.matchMethod.toLowerCase()}{" "}
                    {item.matchConfidence?.toFixed(2)}
                    {item.variantTags.length > 0 ? ` · ${item.variantTags.join(", ")}` : ""}
                  </span>
                </li>
              ))}
              {data.matched.length === 0 && (
                <li className="px-4 py-3 text-muted-foreground">None yet.</li>
              )}
            </AdminList>
          </section>

          <section aria-labelledby="ignored" className="flex flex-col gap-2">
            <h2 id="ignored" className="text-lg font-bold">
              Ignored ({data.ignored.length})
            </h2>
            <AdminList>
              {data.ignored.map((item) => (
                <li key={item.id} className="px-4 py-3">
                  <ItemLine item={item} />
                </li>
              ))}
              {data.ignored.length === 0 && (
                <li className="px-4 py-3 text-muted-foreground">None.</li>
              )}
            </AdminList>
          </section>

          {upload.parses.length > 0 && (
            <section aria-labelledby="parses" className="flex flex-col gap-2">
              <h2 id="parses" className="text-lg font-bold">
                Parse attempts
              </h2>
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
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
