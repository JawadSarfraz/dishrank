// CLAUDE.md rule 2: Overture data is credited on a data sources page linked from every page.
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import DataSourcesPage from "@/app/(public)/about/data/page";
import { Footer } from "@/components/layout";
import { db } from "@/server/db";
import { resetAppData } from "../../setup/db-reset";

const LICENCE = 'href="https://cdla.dev/permissive-2-0/"';
/** The page's text, tags removed (links keep their words). */
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("/about/data credits Overture (CDLA Permissive 2.0)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("credits both datasets with the licence link, and the footer links the page", async () => {
    const html = renderToStaticMarkup(await DataSourcesPage());
    expect(text(html)).toContain("Data from Meta. Available under CDLA Permissive 2.0.");
    expect(text(html)).toContain("Data from Microsoft. Available under CDLA Permissive 2.0.");
    expect(html).toContain(LICENCE);
    expect(renderToStaticMarkup(Footer())).toMatch(/<a[^>]*href="\/about\/data"[^>]*>/);
  });
});
