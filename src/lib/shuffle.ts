// A deterministic shuffle for lists that must not keep a fixed order (the unranked contenders of a
// dish: the top row would collect votes just for being on top). Each item gets a key from a hash of
// the seed and its id, and the list is sorted by that key. Two lists made with the same seed agree
// on the order of every item they share, so the cached dish page and the quick-rate list it opens
// show the contenders the same way even when one has a row the other lacks. A new seed on each
// render of the page gives a new order.

/** FNV-1a (32-bit) over the seed and the id. */
export function shuffleKey(seed: string, id: string): number {
  let h = 0x811c9dc5;
  const s = `${seed}:${id}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function seededOrder<T>(items: readonly T[], seed: string, idOf: (item: T) => string): T[] {
  return [...items].sort(
    (a, b) =>
      shuffleKey(seed, idOf(a)) - shuffleKey(seed, idOf(b)) || idOf(a).localeCompare(idOf(b)),
  );
}
