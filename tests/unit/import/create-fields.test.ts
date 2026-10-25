import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it } from "vitest";
import { RestaurantCreateFields } from "@/components/admin/RestaurantCreateFields";

type Props = Parameters<typeof RestaurantCreateFields>[0];

describe("Create form (docs/07 §2)", () => {
  it("cannot receive a Google name or address", () => {
    expectTypeOf<Props>().not.toHaveProperty("displayName");
    expectTypeOf<Props>().not.toHaveProperty("formattedAddress");
    expectTypeOf<Props>().not.toHaveProperty("result");
  });

  it("starts with an empty name and address, the searched area selected, and the typing note", () => {
    const html = renderToStaticMarkup(
      createElement(RestaurantCreateFields, {
        idPrefix: "t",
        cities: [
          {
            id: "c1",
            name: "Islamabad",
            areas: [
              { id: "a1", name: "F-7" },
              { id: "a2", name: "G-9" },
            ],
          },
          { id: "c2", name: "Rawalpindi", areas: [{ id: "a3", name: "Saddar" }] },
        ],
        defaultAreaId: "a2",
        pending: false,
        error: null,
        onSubmit: () => {},
      }),
    );
    const nameInput = html.match(/<input[^>]*name="name"[^>]*>/)?.[0] ?? "";
    expect(nameInput).not.toBe("");
    expect(nameInput).not.toMatch(/value=/);
    expect(html).toMatch(/<textarea[^>]*name="address"[^>]*><\/textarea>/);
    expect(html).toMatch(/<option value="a2" selected="">G-9<\/option>/);
    expect(html).toMatch(
      /<optgroup label="Rawalpindi"><option value="a3">Saddar<\/option><\/optgroup>/,
    );
    expect(html).toContain("Type the name and address yourself");
    expect(html).toContain("nothing here is copied from Google");
  });
});
