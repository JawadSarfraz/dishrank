// Google Places (New) client: Text Search for the live admin import and the planning tool
// (docs/07 §1-2) and Place Details for the daily coordinate refresh (docs/07 §5). No other code
// calls Google.
export { createPlacesClient, type PlacesClient, type PlacesClientOptions } from "./client";
export { PlacesApiError, PlacesBudgetError } from "./errors";
export { googleMapsUrl } from "./mapsUrl";
export {
  PLACE_DETAILS_FIELD_MASK,
  buildPlaceDetailsRequest,
  type PlaceDetailsResult,
} from "./placeDetails";
export {
  TEXT_SEARCH,
  TEXT_SEARCH_FIELD_MASK,
  TEXT_SEARCH_IDS_FIELD_MASK,
  buildTextSearchBody,
  buildTextSearchRequest,
  type PlaceResult,
  type TextSearchIdsPage,
  type TextSearchPage,
  type TextSearchParams,
} from "./textSearch";
