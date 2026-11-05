import Link from "next/link";
import { AdminHeader, AdminList, AdminNote, AdminTabs } from "@/components/admin/AdminPage";
import { Forbidden } from "@/components/auth/Forbidden";
import { ButtonLink } from "@/components/ui/button-link";
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
    <main className="flex flex-col gap-5">
      <AdminHeader
        title="Menu photos"
        help={`Read in the last 24 hours: ${data.parsesToday} of ${data.dailyCap}. Every night up to 20 waiting photos are read; open one to read it now.`}
      />
      {!data.parsingEnabled && (
        <AdminNote>
          Reading menus is not set up (ANTHROPIC_API_KEY and ANTHROPIC_VISION_MODEL). Uploads are
          kept and wait here until it is.
        </AdminNote>
      )}
      <AdminTabs
        label="Status"
        items={STATUSES.map(([status, label]) => ({
          href: `/admin/menus?status=${status}`,
          label: `${label} (${data.counts[status] ?? 0})`,
          active: query.status === status,
        }))}
      />
      <AdminList>
        {data.uploads.map((u) => (
          <li key={u.id}>
            <Link
              href={`/admin/menus/${u.id}`}
              className="flex min-h-14 flex-col justify-center gap-0.5 px-4 py-2 hover:bg-muted"
            >
              <span className="font-medium">
                {u.restaurant.name}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {u.restaurant.area?.name ?? "no area"}
                </span>
              </span>
              <span className="text-muted-foreground">
                {dateTime.format(u.createdAt)} by {u.uploadedBy?.email ?? "a deleted account"}
                {u._count.items > 0
                  ? ` · ${u.matched} matched, ${u.needsReview} to review, ${u.ignored} ignored`
                  : ""}
                {u.error ? ` · ${u.error}` : ""}
              </span>
            </Link>
          </li>
        ))}
        {data.uploads.length === 0 && (
          <li className="px-4 py-4 text-muted-foreground">Nothing here.</li>
        )}
      </AdminList>
      {data.nextCursor && (
        <ButtonLink
          variant="outline"
          className="w-fit"
          href={`/admin/menus?status=${query.status}&cursor=${data.nextCursor}`}
        >
          More
        </ButtonLink>
      )}
    </main>
  );
}
