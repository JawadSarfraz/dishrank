// The default share image for pages without their own (home, city, restaurant and trust pages), in
// the "Garma Garam" look of the dish images (redesign spec §7): blush ground, the logo, the tagline
// and its English line, the two cities and the site's address in the brand pill; on the right a
// brand-red panel with the mark drawn large in white with its gold bar.
import { ImageResponse } from "next/og";
import { OG, OgLogo } from "@/components/brand/ShareArt";
import { LogoMark } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";
import { shareImageFonts } from "@/server/services/share-image-assets";
import { SITE_HOST } from "@/server/site";

export const alt = `${BRAND.name} (${BRAND.urduName}): ${BRAND.taglineEnglish}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const fonts = await shareImageFonts();
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
          justifyContent: "space-between",
          width: 700,
          padding: "48px 40px 48px 56px",
        }}
      >
        <OgLogo mark={56} name={34} urdu={42} gap={14} />
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              fontFamily: OG.display,
              fontSize: 68,
              lineHeight: "70px",
              letterSpacing: -1.7,
            }}
          >
            {BRAND.tagline}
          </div>
          <div style={{ display: "flex", fontSize: 32, lineHeight: "40px", fontWeight: 600 }}>
            {BRAND.taglineEnglish}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 12 }}>
            {["Islamabad", "Rawalpindi"].map((city) => (
              <div
                key={city}
                style={{
                  display: "flex",
                  padding: "8px 22px",
                  borderRadius: 999,
                  background: OG.white,
                  fontSize: 28,
                }}
              >
                {city}
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              alignItems: "center",
              height: 56,
              padding: "0 28px",
              borderRadius: 999,
              background: OG.brand,
              color: OG.white,
              fontFamily: OG.display,
              fontSize: 30,
            }}
          >
            {SITE_HOST}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 500,
          height: 630,
          background: OG.brand,
          color: OG.white,
        }}
      >
        <LogoMark size={320} gold={OG.gold} />
      </div>
    </div>,
    { ...size, fonts },
  );
}
