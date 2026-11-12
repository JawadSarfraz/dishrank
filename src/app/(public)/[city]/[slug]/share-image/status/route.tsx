// The ranking page's WhatsApp status card, 1080 × 1920 (redesign spec §7): the dish photo (or its
// tile and glyph) on top with the logo pill and the "Voting open" sticker, then a white sheet with
// the title, a podium of the top three (or the first raters' seats while nothing ranks), the call
// to vote and the small print. The top 200 px and bottom 250 px hold nothing that matters (WhatsApp
// lays its own controls there). Same facts and version as the link preview
// (src/server/services/share-image.ts); rendered on each request.
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

/** The podium's columns (spec §7): #1 gold and tallest in the middle, #2 and #3 blush-strong. */
const BLOCKS = {
  1: { height: 310, numeral: 160, raters: 34, weight: 700, bg: OG.gold },
  2: { height: 240, numeral: 120, raters: 32, weight: 600, bg: OG.blushStrong },
  3: { height: 190, numeral: 100, raters: 32, weight: 600, bg: OG.blushStrong },
} as const;

const raters = (n: number) => `${n} rater${n === 1 ? "" : "s"}`;

function Podium({ top }: { top: Row[] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginTop: 40 }}>
      {podiumSlots(top).map((row, i) => {
        if (!row) return <div key={i} style={{ display: "flex", flex: 1 }} />;
        const b = BLOCKS[Math.min(row.rank, 3) as 1 | 2 | 3];
        return (
          <div
            key={i}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}
          >
            <div
              style={{
                display: "flex",
                textAlign: "center",
                fontSize: 38,
                lineHeight: "44px",
                fontWeight: 700,
              }}
            >
              {fitName(row.name, 14, 2)}
            </div>
            {row.area && (
              <div
                style={{
                  display: "flex",
                  marginTop: 4,
                  fontSize: 30,
                  lineHeight: "36px",
                  fontWeight: 400,
                  color: OG.muted,
                }}
              >
                {fitName(row.area, 18, 1)}
              </div>
            )}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                alignSelf: "stretch",
                height: b.height,
                marginTop: 16,
                borderRadius: "32px 32px 0 0",
                background: b.bg,
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
                  fontSize: b.raters,
                  lineHeight: 1.18,
                  fontWeight: b.weight,
                }}
              >
                {raters(row.votes)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Seats({ seats }: { seats: NonNullable<ShareImageFacts["seats"]> }) {
  // Four seats at the spec's sizes; more (a city past its early rankings) get smaller to fit.
  const others = Math.min(
    160,
    Math.floor((936 - 176 - 24 * (seats.total - 1)) / (seats.total - 1)),
  );
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", marginTop: 48 }}>
        <OgSeats
          total={seats.total}
          filled={seats.filled}
          you={{ size: 176, border: 8, font: 50 }}
          seat={{ size: others, border: 6, font: Math.round(others * 0.35) }}
          gap={24}
        />
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 36,
          fontFamily: OG.display,
          fontSize: 64,
          lineHeight: "70px",
          letterSpacing: -0.96,
        }}
      >
        {seats.call}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 12,
          fontSize: 38,
          lineHeight: "48px",
          fontWeight: 400,
          color: OG.muted,
        }}
      >
        {seats.note}
      </div>
    </div>
  );
}

export async function GET(
  _request: Request,
  ctx: RouteContext<"/[city]/[slug]/share-image/status">,
) {
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
  const titleSize = facts.title.length > (facts.open ? 46 : 34) ? 84 : 96;
  // On a photo the ranked card's sticker sits at the top right (spec); on a tile the glyph is
  // there, so the sticker goes under the logo pill as on the voting-open card.
  const stickerRight = !facts.open && photo;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: OG.white,
        color: OG.ink,
        fontFamily: OG.body,
        fontWeight: 700,
      }}
    >
      <OgDishPanel
        photo={photo}
        look={look}
        alt={ranking.dish.name}
        width={1080}
        height={560}
        glyph={{ size: 380, style: { right: 56, top: 150 } }}
      >
        <div
          style={{
            position: "absolute",
            top: 212,
            left: 56,
            display: "flex",
            padding: "14px 28px 14px 18px",
            borderRadius: 999,
            background: OG.white,
            boxShadow: "0 8px 20px rgba(27,20,16,0.2)",
          }}
        >
          <OgLogo mark={68} name={44} urdu={52} gap={16} />
        </div>
        {stickerRight ? (
          <OgSticker onTile={false} fontSize={34} rotate={5} style={{ top: 226, right: 56 }} />
        ) : (
          <OgSticker onTile={!photo} fontSize={36} rotate={-4} style={{ top: 360, left: 64 }} />
        )}
      </OgDishPanel>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          marginTop: -64,
          padding: "64px 72px 0",
          borderRadius: "64px 64px 0 0",
          background: OG.white,
        }}
      >
        <OgTitle
          text={facts.title}
          highlight={facts.highlight}
          fontSize={titleSize}
          lineHeight={titleSize + 4}
        />
        {facts.seats ? <Seats seats={facts.seats} /> : <Podium top={facts.top} />}
        <div
          style={{
            display: "flex",
            marginTop: facts.seats ? 44 : 48,
            fontSize: 54,
            lineHeight: "62px",
            letterSpacing: -0.54,
          }}
        >
          {facts.line}
        </div>
        <div style={{ display: "flex", marginTop: 28 }}>
          <OgVotePill host={SITE_HOST} height={108} fontSize={50} padding={48} />
        </div>
        {facts.closingLine && (
          <div style={{ display: "flex", marginTop: 32, fontSize: 36, color: OG.brandDark }}>
            {facts.closingLine}
          </div>
        )}
        <div
          style={{
            display: "flex",
            marginTop: facts.closingLine ? 20 : 36,
            fontSize: 30,
            lineHeight: "38px",
            fontWeight: 400,
            color: OG.muted,
          }}
        >
          Scores are diners&apos; opinions, not facts about a restaurant.
        </div>
      </div>
    </div>,
    { width: 1080, height: 1920, fonts },
  );
}
