export type LatLng = { lat: number; lng: number };

/** Mean Earth radius (IUGG), in kilometres. */
const EARTH_RADIUS_KM = 6371.0088;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres (haversine; ADR-5: no PostGIS in v1). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
