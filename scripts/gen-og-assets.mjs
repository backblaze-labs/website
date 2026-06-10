// One-time asset generator for SEO/social images. Run manually after the
// source artwork changes — the outputs are committed to `public/`, so the
// build itself never shells out to sharp.
//
//   npm run gen-assets
//
// Produces:
//   public/og.jpg            1200×630 social card (Open Graph / Twitter).
//   public/apple-touch-icon.png  180×180 iOS home-screen icon.
//
// `sharp` is available transitively via astro (a core build dependency), so it
// isn't listed as a direct dep — this script is a manual, dev-only convenience.
//
// The OG source is a full-page screenshot of the site. We crop top-anchored to
// 1.91:1 so the "Build with Backblaze B2" hero headline survives the crop — a
// centre crop would drop it. The icon is the brand flame on the brand navy;
// iOS rounds the corners itself, so we ship a plain square.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");

const OG_SOURCE = path.join(root, "backblazelabs.jpg");
const FLAME_SVG = path.join(root, "public/favicon.svg");
const OG_OUT = path.join(root, "public/og.jpg");
const ICON_OUT = path.join(root, "public/apple-touch-icon.png");

const NAVY = "#000033"; // matches manifest background_color / theme_color

async function genOg() {
  if (!fs.existsSync(OG_SOURCE)) {
    throw new Error(
      `OG source not found: ${OG_SOURCE} (expected the site screenshot in repo root)`,
    );
  }
  await sharp(OG_SOURCE)
    // 1200×630 is the canonical OG aspect (1.91:1); declared in BaseLayout meta.
    .resize(1200, 630, { fit: "cover", position: "top" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(OG_OUT);
  console.log(`✓ ${path.relative(root, OG_OUT)}`);
}

async function genIcon() {
  // Render the flame to ~120px tall, centred on a 180×180 navy square.
  const flame = await sharp(FLAME_SVG).resize({ height: 120 }).png().toBuffer();
  await sharp({
    create: { width: 180, height: 180, channels: 4, background: NAVY },
  })
    .composite([{ input: flame, gravity: "center" }])
    .png()
    .toFile(ICON_OUT);
  console.log(`✓ ${path.relative(root, ICON_OUT)}`);
}

await Promise.all([genOg(), genIcon()]);
