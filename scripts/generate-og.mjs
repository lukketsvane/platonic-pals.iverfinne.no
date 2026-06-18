// Generates the 1200×630 social-share banner (Open Graph / Twitter card) used
// when the site is shared on Facebook, Discord, Slack, X, etc.
//
//   node scripts/generate-og.mjs
//
// Source art is the 6-up grid of platonic pals in scripts/og-source.png. We
// upscale it to fill the card, dim it slightly, and lay the Silkscreen wordmark
// over a soft bottom scrim so the brand reads at thumbnail size.
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "og-source.png");
const OUT = join(here, "..", "public", "og.png");

const W = 1200;
const H = 630;

// The pals grid, scaled to cover the whole card.
const grid = await sharp(SRC)
  .resize(W, H, { fit: "cover", kernel: "lanczos3" })
  .modulate({ brightness: 0.92 })
  .toBuffer();

// Bottom scrim + wordmark.
const overlay = Buffer.from(`
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050507" stop-opacity="0"/>
      <stop offset="60%" stop-color="#050507" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#050507" stop-opacity="0.9"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${H - 260}" width="${W}" height="260" fill="url(#scrim)"/>
  <text x="64" y="${H - 78}" font-family="Silkscreen" font-weight="700"
        font-size="84" fill="#ffffff" letter-spacing="2">platonic pals</text>
  <text x="66" y="${H - 36}" font-family="Silkscreen" font-weight="400"
        font-size="26" fill="#ffffff" fill-opacity="0.72" letter-spacing="3">a tiny gallery of platonic friends</text>
</svg>`);

await sharp(grid)
  .composite([{ input: overlay, top: 0, left: 0 }])
  .png()
  .toFile(OUT);

console.log("wrote", OUT);
