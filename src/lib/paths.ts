// Paths that more than one page builds, shared by server and client components (a helper exported
// from a "use client" module cannot be called on the server).

/** The rate flow with its suggest-a-restaurant form open: "Missing one? Add it", "Tell us". */
export const suggestPlacePath = (citySlug: string) =>
  `/rate?city=${citySlug}&suggest=1#suggest-restaurant`;
