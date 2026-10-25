import { describe, expect, it } from "vitest";
import { haversineKm } from "@/lib/geo";

const islamabad = { lat: 33.6844, lng: 73.0479 };
const rawalpindi = { lat: 33.5651, lng: 73.0169 };

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm(islamabad, islamabad)).toBe(0);
  });

  it("Islamabad to Rawalpindi city centres is about 13.6 km, both ways", () => {
    expect(haversineKm(islamabad, rawalpindi)).toBeCloseTo(13.6, 1);
    expect(haversineKm(rawalpindi, islamabad)).toBeCloseTo(haversineKm(islamabad, rawalpindi), 10);
  });

  it("one degree of latitude is about 111.2 km", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.2, 1);
  });

  it("antipodes are half the Earth's circumference apart", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(
      Math.PI * 6371.0088,
      3,
    );
  });
});
