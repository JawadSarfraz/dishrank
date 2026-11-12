// The ranking page's link-preview image (WhatsApp, Facebook), 1200 × 630, in the "Garma Garam"
// look (redesign spec §7): blush ground, the logo, the title, then a podium of the top three when a
// place ranks, or the first raters' seats while voting is open; the dish photo (or its tile and
// glyph) on the right with the "Voting open" sticker. A route of its own, not opengraph-image, so
// the page can put a version in the URL (src/server/services/share-image.ts). Rendered on each
// request (crawlers fetch it rarely).
import { ImageResponse } from "next/og";
import {
  OG,
  OgDishPanel,
  OgLogo,
  OgSeats,
  OgSticker,
  OgTitle,
  OgVotePill,
  fitName,
  podiumSlots,
} from "@/components/brand/ShareArt";
import { dishLook } from "@/lib/dish-look";
import { SLUG_PATTERN } from "@/lib/slug";
import { getRankingPage } from "@/server/services/ranking.service";
import { shareImageFacts, type ShareImageFacts } from "@/server/services/share-image";
import { dishPhotoDataUri, shareImageFonts } from "@/server/services/share-image-assets";
import { SITE_HOST } from "@/server/site";

type Row = ShareImageFacts["top"][number];

/** The podium's blocks (spec §7): #1 gold and tallest in the middle, #2 and #3 white. */
const BLOCKS = {
  1: { height: 180, numeral: 72, name: 26, perLine: 13, bg: OG.gold },
  2: { height: 140, numeral: 52, name: 24, perLine: 14, bg: OG.white },
  3: { height: 116, numeral: 42, name: 22, perLine: 15, bg: OG.white },
} as const;

function Podium({ top }: { top: Row[] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, width: 620, height: 180 }}>
      {podiumSlots(top).map((row, i) => {
        if (!row) return <div key={i} style={{ display: "flex", flex: 1 }} />;
        const b = BLOCKS[Math.min(row.rank, 3) as 1 | 2 | 3];
        return (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              height: b.height,
              padding: "8px 12px",
              borderRadius: "20px 20px 0 0",
              background: b.bg,
              color: OG.ink,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                fontFamily: OG.display,
                fontSize: b.numeral,
                lineHeight: 1,
              }}
            >
              {row.rank}
            </div>
            <div
              style={{
                display: "flex",
                textAlign: "center",
                fontSize: b.name,
                lineHeight: 1.15,
                fontWeight: 700,
              }}
            >
              {fitName(row.name, b.perLine, 2)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SeatsRow({ seats }: { seats: NonNullable<ShareImageFacts["seats"]> }) {
  // Four seats at the spec's sizes; more (a city past its early rankings) get smaller to fit.
  const others = Math.min(72, Math.floor((440 - 80 - 14 * (seats.total - 1)) / (seats.total - 1)));
  const [first, ...rest] = seats.call.split(" ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 22 }}>
      <OgSeats
        total={seats.total}
        filled={seats.filled}
        you={{ size: 80, border: 4, font: 23 }}
        seat={{ size: others, border: 3, font: Math.max(22, Math.round(others * 0.36)) }}
        gap={14}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontFamily: OG.display,
          fontSize: 30,
          lineHeight: "34px",
        }}
      >
        <div style={{ display: "flex" }}>{[first, rest[0]].join(" ")}</div>
        <div style={{ display: "flex" }}>{rest.slice(1).join(" ")}</div>
      </div>
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
  const [fonts, photo] = await Promise.all([shareImageFonts(), dishPhotoDataUri(dishSlug)]);
  const facts = shareImageFacts(ranking);
  const look = dishLook(dishSlug);
  const titleSize = facts.open
    ? facts.title.length > 48
      ? 52
      : 60
    : facts.title.length > 34
      ? 46
      : 56;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: OG.blush,
        color: OG.ink,
        fontFamily: OG.body,
        fontWeight: 700,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 700,
          padding: "40px 24px 40px 56px",
        }}
      >
        <OgLogo mark={56} name={34} urdu={42} gap={14} />
        <OgTitle
          text={facts.title}
          highlight={facts.highlight}
          fontSize={titleSize}
          lineHeight={titleSize + 2}
          style={{ marginTop: 18, maxWidth: 620 }}
        />
        {facts.seats ? (
          <SeatsRow seats={facts.seats} />
        ) : (
          <div style={{ display: "flex", marginTop: 20 }}>
            <Podium top={facts.top} />
          </div>
        )}
        <div style={{ display: "flex", marginTop: facts.seats ? 20 : 18, fontSize: 34 }}>
          {facts.line}
        </div>
        <div style={{ display: "flex", marginTop: 12 }}>
          <OgVotePill host={SITE_HOST} height={56} fontSize={30} padding={28} />
        </div>
      </div>
      <OgDishPanel
        photo={photo}
        look={look}
        alt={ranking.dish.name}
        width={500}
        height={630}
        glyph={{ size: 340, style: { left: 80, top: 185 } }}
      >
        <OgSticker onTile={!photo} fontSize={30} rotate={4} style={{ top: 40, right: 36 }} />
      </OgDishPanel>
    </div>,
    { width: 1200, height: 630, fonts },
  );
}
