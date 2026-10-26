// Display formats shared by server and client components. Deterministic (no locale data), so the
// server's HTML and the browser's render always agree.

/** "8.3": scores have three decimals stored and one shown. */
export const formatScore = (score: number) => score.toFixed(1);

/** "1 vote", "23 votes" (votes = different people, docs/01 copy rules). */
export const formatVotes = (votes: number) => `${votes} vote${votes === 1 ? "" : "s"}`;

/** "Rs 1,850" (prices are whole rupees). */
export const formatPrice = (price: number) =>
  `Rs ${String(price).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/** "1.4 km". */
export const formatKm = (km: number) => `${km.toFixed(1)} km`;

/** "needs 1 more rating", "needs 4 more ratings". */
export const formatNeeded = (n: number) =>
  n > 0 ? `needs ${n} more rating${n === 1 ? "" : "s"} to rank` : "ranks at the next update";
