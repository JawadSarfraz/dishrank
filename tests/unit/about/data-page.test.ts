import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import DataSourcesPage from "@/app/(public)/about/data/page";
import { Footer } from "@/components/layout";
import { db } from "@/server/db";
import { resetAppData } from "../../setup/db-reset";

const LICENCE = 'href="https://cdla.dev/permissive-2-0/"';

/** The page's text, tags removed (links keep their words). */
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

describe("/about/data credits Overture (CDLA Permissive 2.0)", () => {
  beforeEach(resetAppData);
  afterAll(() => db.$disconnect());

  it("shows the report's exact credit lines and links the licence text", async () => {
    const html = renderToStaticMarkup(await DataSourcesPage());
    const page = text(html);
    expect(page).toContain(
      "Overture Maps Foundation, overturemaps.org (release 2026-10-21.0, accessed 2026-10-25).",
    );
    expect(page).toContain("Data from Meta. Available under CDLA Permissive 2.0.");
    expect(page).toContain("Data from Microsoft. Available under CDLA Permissive 2.0.");
    expect(html.split(LICENCE).length - 1).toBe(3); // both lines and the licence text link
    expect(page).toContain("Rankings come only from ratings by DishRank users.");
  });

  it("credits the newest synced release, accessed on the day it was first synced", async () => {
    await db.jobRun.create({
      data: {
        name: "overture-sync",
        ok: true,
        startedAt: new Date("2026-11-20T08:00:00Z"),
        summary: { release: "2026-11-18.0" },
      },
    });
    expect(text(renderToStaticMarkup(await DataSourcesPage()))).toContain(
      "Overture Maps Foundation, overturemaps.org (release 2026-11-18.0, accessed 2026-11-20).",
    );
  });

  it("is linked from the footer", () => {
    expect(renderToStaticMarkup(Footer())).toMatch(
      /<a[^>]*href="\/about\/data"[^>]*>Data sources<\/a>/,
    );
  });
});
