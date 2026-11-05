// The ranking page's share image (WhatsApp, Facebook): dish, city and a podium of the top three,
// 1200 × 630, in the brand colours (docs/12-DESIGN.md). Rendered on each request (crawlers fetch
// it rarely). Satori (next/og) needs an explicit flex display on every element with text.
import { ImageResponse } from "next/og";
import { OgWordmark, ogFont } from "@/app/opengraph-image";
import { BRAND } from "@/lib/brand";
import { formatScore, formatVotes } from "@/lib/format";
import { SCORE_BAND_HEX, scoreBand } from "@/lib/score-band";
import { getRanking } from "@/server/services/ranking.service";

export const alt = `${BRAND.name}: restaurants ranked for one dish`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const display = ogFont("bricolage-grotesque-800.ttf");
const body = ogFont("geist-500.ttf");

const MEDAL: Record<number, { bg: string; ink: string }> = {
  1: { bg: "#d4a72c", ink: "#3a2a00" },
  2: { bg: "#d7dce1", ink: "#16201b" },
  3: { bg: "#d9a77b", ink: "#16201b" },
};

function Podium({
  row,
  first,
}: {
  row: { rank: number; name: string; area: string | null; score: number; votes: number };
  first: boolean;
}) {
  const medal = MEDAL[row.rank] ?? { bg: "#eef1ee", ink: "#16201b" };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        flex: first ? 1.25 : 1,
        minHeight: first ? 236 : 196,
        padding: "22px 24px",
        borderRadius: 24,
        background: "#ffffff",
        border: first ? "3px solid #d4a72c" : "2px solid #e2e6e2",
        boxShadow: first ? "0 10px 0 #d4a72c" : "0 2px 0 #e2e6e2",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 54,
            height: 54,
            borderRadius: 999,
            background: medal.bg,
            color: medal.ink,
            fontFamily: "Bricolage Grotesque",
            fontSize: 30,
          }}
        >
          {row.rank}
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontSize: first ? 34 : 28,
            lineHeight: 1.1,
            letterSpacing: -0.5,
            overflow: "hidden",
          }}
        >
          {row.name.length > 30 ? `${row.name.slice(0, 29)}…` : row.name}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 24, color: "#5e6963" }}>
          {[row.area, formatVotes(row.votes)].filter(Boolean).join(" · ")}
        </div>
        <div
          style={{
            display: "flex",
            padding: "6px 16px",
            borderRadius: 12,
            background: SCORE_BAND_HEX[scoreBand(row.score)],
            color: "#ffffff",
            fontFamily: "Bricolage Grotesque",
            fontSize: first ? 40 : 34,
          }}
        >
          {formatScore(row.score)}
        </div>
      </div>
    </div>
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ city: string; slug: string }>;
}) {
  const [{ city, slug }, displayFont, bodyFont] = await Promise.all([params, display, body]);
  const dishSlug = slug.startsWith("best-") ? slug.slice("best-".length) : "";
  const ranking = dishSlug ? await getRanking({ citySlug: city, dishSlug }) : null;
  const title = ranking ? `Best ${ranking.dish.name} in ${ranking.city.name}` : BRAND.name;
  const top = (ranking?.eligible.slice(0, 3) ?? []).map((row) => ({
    rank: row.rank,
    name: row.restaurant.name,
    area: row.restaurant.area?.name ?? null,
    score: row.score,
    votes: row.votes,
  }));
  // Podium order: silver, gold, bronze (the first in the middle, taller).
  const podium =
    top.length === 3 ? [top[1]!, top[0]!, top[2]!] : top.length === 2 ? [top[0]!, top[1]!] : top;
  const votes = ranking?.eligible.reduce((sum, row) => sum + row.votes, 0) ?? 0;
  const summary = ranking
    ? ranking.eligible.length > 0
      ? `${ranking.eligible.length} ranked from ${formatVotes(votes)} · ranked by diners`
      : "Not enough votes yet. Be the first to rate it."
    : "";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "44px 48px 48px",
        background: "#f7f8f6",
        color: "#16201b",
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <OgWordmark scale={0.5} />
        {ranking?.mode === "bootstrap" && (
          <div
            style={{
              display: "flex",
              marginLeft: 12,
              padding: "6px 16px",
              borderRadius: 999,
              background: "#e4f1ea",
              color: "#0a4d35",
              fontSize: 22,
            }}
          >
            Early rankings
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontSize: top.length > 0 ? 56 : 68,
            lineHeight: 1.05,
            letterSpacing: -1.5,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#5e6963" }}>{summary}</div>
      </div>
      {podium.length > 0 ? (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
          {podium.map((row) => (
            <Podium key={row.rank} row={row} first={row.rank === 1} />
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            padding: "16px 28px",
            borderRadius: 16,
            background: "#0e6b4a",
            color: "#ffffff",
            fontSize: 30,
          }}
        >
          Rate it on {BRAND.name}
        </div>
      )}
    </div>,
    {
      ...size,
      fonts: [
        { name: "Bricolage Grotesque", data: displayFont, weight: 800, style: "normal" },
        { name: "Geist", data: bodyFont, weight: 500, style: "normal" },
      ],
    },
  );
}
