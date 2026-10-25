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

const KM_PER_DEGREE_LAT = 110.574;
const KM_PER_DEGREE_LNG_AT_EQUATOR = 111.32;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * A rectangle reaching `halfSizeKm` north, south, east and west of `center` (for a Places
 * locationRestriction around one of our own area centres).
 */
export function boxAround(center: LatLng, halfSizeKm: number): { low: LatLng; high: LatLng } {
  const dLat = halfSizeKm / KM_PER_DEGREE_LAT;
  const dLng = halfSizeKm / (KM_PER_DEGREE_LNG_AT_EQUATOR * Math.cos(toRad(center.lat)));
  return {
    low: { lat: round6(center.lat - dLat), lng: round6(center.lng - dLng) },
    high: { lat: round6(center.lat + dLat), lng: round6(center.lng + dLng) },
  };
}
