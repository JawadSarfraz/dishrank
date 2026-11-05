// pnpm icons:build: renders the app icons from the logo mark (src/components/brand/Logo.tsx) with
// Playwright's Chromium: public/icons/icon-192.png, icon-512.png and maskable-512.png (the
// manifest), src/app/apple-icon.png (iPhone home screen), src/app/icon.svg (the favicon) and
// src/app/favicon.ico (PNG frames in an ICO container). Run it again after changing the mark.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BRAND = "#0e6b4a";
const GOLD = "#d4a72c";
const PAPER = "#ffffff";

/** The mark, white on the brand green (the same drawing as Logo.tsx). */
const mark = (ink: string, gold: string, scale: number, offset: number) =>
  `<g transform="translate(${offset} ${offset}) scale(${scale})">
    <circle cx="16" cy="16" r="11.5" fill="none" stroke="${ink}" stroke-width="2.6"/>
    <circle cx="3.2" cy="16" r="2.4" fill="none" stroke="${ink}" stroke-width="2"/>
    <circle cx="28.8" cy="16" r="2.4" fill="none" stroke="${ink}" stroke-width="2"/>
    <rect x="9" y="15" width="3.6" height="7" rx="1.2" fill="${ink}"/>
    <rect x="14.2" y="10" width="3.6" height="12" rx="1.2" fill="${gold}"/>
    <rect x="19.4" y="17" width="3.6" height="5" rx="1.2" fill="${ink}"/>
  </g>`;

/** A rounded green tile with the mark (any-purpose icons and the favicon). */
const tile = (
  size: number,
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
  <rect width="64" height="64" rx="14" fill="${BRAND}"/>
  ${mark(PAPER, GOLD, 1.5, 8)}
</svg>`;

/** Full-bleed green with the mark inside the maskable safe zone (the centre 80%). */
const maskable = (
  size: number,
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
  <rect width="64" height="64" fill="${BRAND}"/>
  ${mark(PAPER, GOLD, 1.2, 12.8)}
</svg>`;

/** PNG frames in an ICO container (every modern browser reads it). */
function ico(frames: { size: number; png: Buffer }[]) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const entries: Buffer[] = [];
  const bodies: Buffer[] = [];
  let offset = 6 + 16 * frames.length;
  for (const { size, png } of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    bodies.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...bodies]);
}

async function main() {
  mkdirSync("public/icons", { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (svg: string, size: number) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg}</body></html>`,
    );
    return page.screenshot({
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
  };
  writeFileSync("public/icons/icon-192.png", await render(tile(192), 192));
  writeFileSync("public/icons/icon-512.png", await render(tile(512), 512));
  writeFileSync("public/icons/maskable-512.png", await render(maskable(512), 512));
  writeFileSync("src/app/apple-icon.png", await render(tile(180), 180));
  writeFileSync("src/app/icon.svg", tile(64));
  writeFileSync(
    "src/app/favicon.ico",
    ico([
      { size: 16, png: await render(tile(16), 16) },
      { size: 32, png: await render(tile(32), 32) },
      { size: 48, png: await render(tile(48), 48) },
    ]),
  );
  await browser.close();
  console.log("icons written: public/icons/*.png, src/app/apple-icon.png, icon.svg, favicon.ico");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
