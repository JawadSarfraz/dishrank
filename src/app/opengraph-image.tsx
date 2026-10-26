// The default share image for pages without their own (home, city, restaurant and trust pages).
import { ImageResponse } from "next/og";

export const alt = "DishRank: restaurants ranked dish by dish";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 24,
        padding: 80,
        background: "#ffffff",
        color: "#111111",
      }}
    >
      <div style={{ fontSize: 96, fontWeight: 700 }}>DishRank</div>
      <div style={{ fontSize: 44 }}>
        The best restaurants for each dish in Islamabad and Rawalpindi.
      </div>
    </div>,
    size,
  );
}
