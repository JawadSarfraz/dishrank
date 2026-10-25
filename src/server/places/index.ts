// Google Places (New) client: Text Search for seeding (docs/07 §1) and Place Details for the daily
// coordinate refresh (docs/07 §5). No other code calls Google.
export { createPlacesClient, type PlacesClient, type PlacesClientOptions } from "./client";
export { PlacesApiError, PlacesBudgetError } from "./errors";
export {
  PLACE_DETAILS_FIELD_MASK,
  buildPlaceDetailsRequest,
  type PlaceDetailsResult,
} from "./placeDetails";
export {
  TEXT_SEARCH,
  TEXT_SEARCH_FIELD_MASK,
  buildTextSearchBody,
  buildTextSearchRequest,
  type PlaceCandidate,
  type TextSearchPage,
  type TextSearchParams,
} from "./textSearch";
