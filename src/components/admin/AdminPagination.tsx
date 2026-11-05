import { ButtonLink } from "@/components/ui/button-link";

/** Previous / Next for the admin lists. */
export function AdminPagination({
  page,
  pages,
  href,
}: {
  page: number;
  pages: number;
  href: (page: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center gap-2 text-sm">
      {page > 1 && (
        <ButtonLink variant="outline" size="sm" href={href(page - 1)}>
          Previous
        </ButtonLink>
      )}
      <span className="px-2 text-muted-foreground">
        Page {page} of {pages}
      </span>
      {page < pages && (
        <ButtonLink variant="outline" size="sm" href={href(page + 1)}>
          Next
        </ButtonLink>
      )}
    </nav>
  );
}
