// The default share image for pages without their own (home, city, restaurant and trust pages):
// the wordmark, the tagline and the two cities, in the brand colours (docs/12-DESIGN.md).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { URDU_NAME } from "@/components/brand/urdu-name";
import { BRAND } from "@/lib/brand";

export const alt = `${BRAND.name} (${BRAND.urduName}): ${BRAND.taglineEnglish}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The TTF files in src/fonts (next.config.ts traces them into the image routes' bundles). */
export const ogFont = (file: string) =>
  readFile(path.join(process.cwd(), "src", "fonts", file)).then((buf) =>
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );

const display = ogFont("bricolage-grotesque-800.ttf");
const body = ogFont("geist-500.ttf");

/** The mark at share-image size (the same drawing as src/components/brand/Logo.tsx). */
export function OgMark({ size: px, ink, gold }: { size: number; ink: string; gold: string }) {
  return (
    <svg viewBox="0 0 32 32" width={px} height={px}>
      <circle cx="16" cy="16" r="11.5" fill="none" stroke={ink} strokeWidth="2.6" />
      <circle cx="3.2" cy="16" r="2.4" fill="none" stroke={ink} strokeWidth="2" />
      <circle cx="28.8" cy="16" r="2.4" fill="none" stroke={ink} strokeWidth="2" />
      <rect x="9" y="15" width="3.6" height="7" rx="1.2" fill={ink} />
      <rect x="14.2" y="10" width="3.6" height="12" rx="1.2" fill={gold} />
      <rect x="19.4" y="17" width="3.6" height="5" rx="1.2" fill={ink} />
    </svg>
  );
}

/** The Urdu name's outlines (urdu-name.ts) at a given height; Satori draws the path itself. */
export function OgUrduName({ height, fill }: { height: number; fill: string }) {
  const width = Math.round((height * URDU_NAME.width) / URDU_NAME.height);
  return (
    <svg viewBox={URDU_NAME.viewBox} width={width} height={height}>
      <path d={URDU_NAME.d} fill={fill} />
    </svg>
  );
}

/** Mark + name + Urdu name, the same two-line lockup as the header (Wordmark in Logo.tsx). */
export function OgWordmark({ scale = 1 }: { scale?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 * scale }}>
      <OgMark size={100 * scale} ink="#0e6b4a" gold="#d4a72c" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 * scale }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontSize: 64 * scale,
            lineHeight: 1,
            letterSpacing: -2 * scale,
            color: "#16201b",
          }}
        >
          {BRAND.name}
        </div>
        <OgUrduName height={50 * scale} fill="#0e6b4a" />
      </div>
    </div>
  );
}

export default async function Image() {
  const [displayFont, bodyFont] = await Promise.all([display, body]);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#f7f8f6",
        color: "#16201b",
        fontFamily: "Geist",
      }}
    >
      <OgWordmark />
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontSize: 66,
            lineHeight: 1.1,
            letterSpacing: -2,
          }}
        >
          {BRAND.tagline}
        </div>
        <div style={{ display: "flex", fontSize: 36, color: "#5e6963" }}>
          {BRAND.taglineEnglish}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30 }}>
        {["Islamabad", "Rawalpindi"].map((city) => (
          <div
            key={city}
            style={{
              display: "flex",
              padding: "10px 24px",
              borderRadius: 999,
              background: "#e4f1ea",
              color: "#0a4d35",
            }}
          >
            {city}
          </div>
        ))}
      </div>
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
