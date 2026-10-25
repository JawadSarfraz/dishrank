import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RestaurantCreateFields } from "@/components/admin/RestaurantCreateFields";

type Props = Parameters<typeof RestaurantCreateFields>[0];

const base: Props = {
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
  dishes: [
    { slug: "chicken-karahi", name: "Chicken Karahi" },
    { slug: "pizza", name: "Pizza" },
  ],
  defaultDishSlugs: ["chicken-karahi"],
  withLocation: false,
  note: "Prefilled from Overture",
  submitLabel: "Confirm and create",
  pending: false,
  error: null,
  onSubmit: () => {},
};

const render = (over: Partial<Props> = {}) =>
  renderToStaticMarkup(createElement(RestaurantCreateFields, { ...base, ...over }));

describe("restaurant Create form (docs/07 §2)", () => {
  it("prefills Overture's name, address, phone and website for the admin to correct", () => {
    const html = render({
      prefill: {
        name: "Fixture Karahi Hous",
        address: "Shop 3, Fixture Market",
        phone: "0511234567",
        website: "https://fixture.example",
      },
    });
    expect(html).toMatch(/<input[^>]*name="name"[^>]*value="Fixture Karahi Hous"/);
    expect(html).toMatch(/<textarea[^>]*name="address"[^>]*>Shop 3, Fixture Market<\/textarea>/);
    expect(html).toMatch(/<input[^>]*name="phone"[^>]*value="0511234567"/);
    expect(html).toMatch(/<input[^>]*name="website"[^>]*value="https:\/\/fixture.example"/);
    expect(html).toMatch(/<option value="a2" selected="">G-9<\/option>/);
    expect(html).toMatch(
      /<optgroup label="Rawalpindi"><option value="a3">Saddar<\/option><\/optgroup>/,
    );
    expect(html).toContain("Prefilled from Overture");
  });

  it("pre-ticks the hinted launch dishes only", () => {
    const html = render();
    expect(html).toContain(
      '<input type="checkbox" name="dishSlugs" checked="" value="chicken-karahi"/>',
    );
    expect(html).toMatch(/<input type="checkbox" name="dishSlugs" value="pizza"\/>/);
  });

  it("starts empty with no area chosen and offers a location only for hand-added restaurants", () => {
    const html = render({ defaultAreaId: "", defaultDishSlugs: [], withLocation: true });
    expect(html).not.toMatch(/name="name"[^>]*value=/);
    expect(html).toMatch(/<option value="" disabled="" selected="">Choose an area<\/option>/);
    expect(html).toContain('name="lat"');
    expect(render()).not.toContain('name="lat"');
  });
});
