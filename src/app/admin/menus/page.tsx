import Link from "next/link";
import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";
import { listMenuUploadsForAdmin } from "@/server/services/menu.service";
import { menuUploadsQuery } from "@/server/validation";

const STATUSES = [
  ["PENDING", "Waiting to be read"],
  ["PARSED", "To review"],
  ["FAILED", "Failed"],
  ["REVIEWED", "Done"],
] as const;

const dateTime = new Intl.DateTimeFormat("en-PK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Karachi",
});

export default async function AdminMenusPage({ searchParams }: PageProps<"/admin/menus">) {
  const user = await requirePageRole("ADMIN", "/admin/menus");
  if (!user) return <Forbidden />;

  const parsed = menuUploadsQuery.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : { status: "PENDING" as const };
  const data = await listMenuUploadsForAdmin(user, query);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Menu photos</h1>
      {!data.parsingEnabled && (
        <p role="status" className="rounded-lg border px-3 py-2 text-sm">
          Reading menus is not set up (ANTHROPIC_API_KEY and ANTHROPIC_VISION_MODEL). Uploads are
          kept and wait here until it is.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Read in the last 24 hours: {data.parsesToday} of {data.dailyCap}. Every night up to 20
        waiting photos are read; open one to read it now.
      </p>
      <nav aria-label="Status" className="flex flex-wrap gap-3 text-sm">
        {STATUSES.map(([status, label]) => (
          <Link
            key={status}
            href={`/admin/menus?status=${status}`}
            className={query.status === status ? "font-semibold" : "underline"}
          >
            {label} ({data.counts[status] ?? 0})
          </Link>
        ))}
      </nav>
      <ul className="flex flex-col divide-y rounded-lg border">
        {data.uploads.map((u) => (
          <li key={u.id}>
            <Link
              href={`/admin/menus/${u.id}`}
              className="flex min-h-11 flex-col justify-center px-3 py-2 hover:bg-muted/50"
            >
              <span className="font-medium underline">
                {u.restaurant.name}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {u.restaurant.area?.name ?? "no area"}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">
                {dateTime.format(u.createdAt)} by {u.uploadedBy?.email ?? "a deleted account"}
                {u._count.items > 0
                  ? ` · ${u.matched} matched, ${u.needsReview} to review, ${u.ignored} ignored`
                  : ""}
                {u.error ? ` · ${u.error}` : ""}
              </span>
            </Link>
          </li>
        ))}
        {data.uploads.length === 0 && <li className="px-3 py-2 text-sm">Nothing here.</li>}
      </ul>
      {data.nextCursor && (
        <Link
          href={`/admin/menus?status=${query.status}&cursor=${data.nextCursor}`}
          className="text-sm underline"
        >
          More
        </Link>
      )}
    </main>
  );
}
