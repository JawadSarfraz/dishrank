// The ranking page's share image (WhatsApp, Facebook): dish, city and the top three, 1200 × 630.
import { ImageResponse } from "next/og";
import { formatScore, formatVotes } from "@/lib/format";
import { getRanking } from "@/server/services/ranking.service";

export const alt = "DishRank: restaurants ranked for one dish";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Image({
  params,
}: {
  params: Promise<{ city: string; slug: string }>;
}) {
  const { city, slug } = await params;
  const dishSlug = slug.startsWith("best-") ? slug.slice("best-".length) : "";
  const ranking = dishSlug ? await getRanking({ citySlug: city, dishSlug }) : null;
  const title = ranking ? `Best ${ranking.dish.name} in ${ranking.city.name}` : "DishRank";
  const top = ranking?.eligible.slice(0, 3) ?? [];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: "#ffffff",
        color: "#111111",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 30, color: "#555555" }}>
          {ranking?.mode === "bootstrap" ? "DishRank · Early rankings" : "DishRank"}
        </div>
        <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {top.length === 0 ? (
          <div style={{ fontSize: 36 }}>Not enough votes yet. Rate it on DishRank.</div>
        ) : (
          top.map((row) => (
            <div key={row.rank} style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ fontSize: 44, fontWeight: 700, width: 60 }}>{row.rank}</div>
              <div style={{ fontSize: 42, flex: 1 }}>{row.restaurant.name}</div>
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 700,
                  background: "#111111",
                  color: "#ffffff",
                  borderRadius: 12,
                  padding: "4px 16px",
                }}
              >
                {formatScore(row.score)}
              </div>
              <div style={{ fontSize: 28, color: "#555555", width: 160 }}>
                {formatVotes(row.votes)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>,
    size,
  );
}
