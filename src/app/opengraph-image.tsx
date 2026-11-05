// The default share image for pages without their own (home, city, restaurant and trust pages):
// the wordmark, the tagline and the two cities, in the brand colours (docs/12-DESIGN.md).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

export const alt = `${BRAND.name}: restaurants ranked dish by dish`;
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
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <OgMark size={96} ink="#0e6b4a" gold="#d4a72c" />
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontSize: 92,
            letterSpacing: -3,
          }}
        >
          {BRAND.name}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontSize: 58,
            lineHeight: 1.1,
            letterSpacing: -1.5,
          }}
        >
          {BRAND.tagline},
        </div>
        <div style={{ display: "flex", fontSize: 40, color: "#5e6963" }}>
          from ratings by people who ate there.
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
