// The ranking page's share image (WhatsApp, Facebook): dish, city and a podium of the top three,
// 1200 × 630, in the brand colours (docs/12-DESIGN.md). A route of its own, not opengraph-image, so
// the page can put a version in the URL (src/server/services/share-image.ts). Rendered on each
// request (crawlers fetch it rarely). Satori (next/og) needs an explicit flex display on every
// element with text.
import { ImageResponse } from "next/og";
import { OgSiteAddress, OgWordmark, ogFont } from "@/app/opengraph-image";
import { BRAND } from "@/lib/brand";
import { formatVotes } from "@/lib/format";
import { SCORE_BAND_HEX } from "@/lib/score-band";
import { SLUG_PATTERN } from "@/lib/slug";
import { getRankingPage } from "@/server/services/ranking.service";
import { shareImageFacts } from "@/server/services/share-image";

const display = ogFont("bricolage-grotesque-800.ttf");
const body = ogFont("geist-500.ttf");

const MEDAL: Record<number, { bg: string; ink: string }> = {
  1: { bg: "#d4a72c", ink: "#3a2a00" },
  2: { bg: "#d7dce1", ink: "#16201b" },
  3: { bg: "#d9a77b", ink: "#16201b" },
};

type Row = ReturnType<typeof shareImageFacts>["top"][number];

function ScoreChip({ row, fontSize, padding }: { row: Row; fontSize: number; padding: string }) {
  return (
    <div
      style={{
        display: "flex",
        padding,
        borderRadius: 12,
        background: SCORE_BAND_HEX[row.band],
        color: "#ffffff",
        fontFamily: "Bricolage Grotesque",
        fontSize,
      }}
    >
      {row.score}
    </div>
  );
}

function Podium({ row, first, early }: { row: Row; first: boolean; early: boolean }) {
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
      {early ? (
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div
              style={{
                display: "flex",
                fontFamily: "Bricolage Grotesque",
                fontSize: first ? 40 : 34,
                lineHeight: 1.1,
              }}
            >
              {formatVotes(row.votes)}
            </div>
            {row.area && (
              <div style={{ display: "flex", fontSize: 22, color: "#5e6963" }}>{row.area}</div>
            )}
          </div>
          <ScoreChip row={row} fontSize={22} padding="3px 10px" />
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 24, color: "#5e6963" }}>
            {[row.area, formatVotes(row.votes)].filter(Boolean).join(" · ")}
          </div>
          <ScoreChip row={row} fontSize={first ? 40 : 34} padding="6px 16px" />
        </div>
      )}
    </div>
  );
}

export async function GET(_request: Request, ctx: RouteContext<"/[city]/[slug]/share-image">) {
  const { city, slug } = await ctx.params;
  const dishSlug = slug.startsWith("best-") ? slug.slice("best-".length) : "";
  const ranking =
    SLUG_PATTERN.test(dishSlug) && SLUG_PATTERN.test(city)
      ? await getRankingPage({ citySlug: city, dishSlug })
      : null;
  if (!ranking) return new Response(null, { status: 404 });
  const [displayFont, bodyFont] = await Promise.all([display, body]);
  const { title, early, summary, top } = shareImageFacts(ranking);
  // Podium order: silver, gold, bronze (the first in the middle, taller).
  const podium =
    top.length === 3 ? [top[1]!, top[0]!, top[2]!] : top.length === 2 ? [top[0]!, top[1]!] : top;

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
        {early && (
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
            New list
          </div>
        )}
        <OgSiteAddress fontSize={26} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontSize: top.length > 0 || title.length > 34 ? 56 : 68,
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
            <Podium key={row.rank} row={row} first={row.rank === 1} early={early} />
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
      width: 1200,
      height: 630,
      fonts: [
        { name: "Bricolage Grotesque", data: displayFont, weight: 800, style: "normal" },
        { name: "Geist", data: bodyFont, weight: 500, style: "normal" },
      ],
    },
  );
}
