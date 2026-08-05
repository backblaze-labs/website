// Manual, dev-only generator for per-detail-page image assets. Run after the
// upstream source artwork changes — like scripts/gen-og-assets.mjs, the outputs
// are committed to `public/`, so the build itself never fetches or shells out
// to sharp.
//
//   npm run gen-detail-assets
//
// Produces, per detail page:
//   public/og/<id>.jpg              1200×630 JPEG social card (Open Graph / Twitter).
//   public/screenshots/<name>.webp  full-size in-page screenshots, optimized.
//
// The hero/dashboard screenshot doubles as the OG card source (cover-cropped to
// 1.91:1, matching gen-og-assets). Unlike the 640×240 thumbnails in
// public/previews/ (built by sync-previews), the screenshots here stay large
// enough to read, and they never land in public/previews/ — sync-previews'
// prune step would otherwise delete any .webp it doesn't know about.
//
// `sharp` ships transitively via astro (a build dep), so it isn't a direct
// dependency — this script is a manual convenience only.

import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import sharp from "sharp";
import { FETCH_UA } from "./_http.mjs";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");

// Upstream high-res sources → committed detail-page assets. Kept here rather
// than in labs.json so the generated /og and /screenshots paths stay stable
// while their provenance remains reproducible from a fresh clone.
const ASSETS = [
  {
    id: "vibe-coding-starter-kit",
    // OG card is cover-cropped from the dashboard/hero screenshot.
    ogSource:
      "https://raw.githubusercontent.com/backblaze-b2-samples/vibe-coding-starter-kit/main/docs/images/b2-starterkit-dashboard1.png",
    // Full-size in-page screenshots, localized (kept readable, not cropped to
    // thumbnails).
    screenshots: [
      {
        source:
          "https://raw.githubusercontent.com/backblaze-b2-samples/vibe-coding-starter-kit/main/docs/images/b2-starterkit-fileview2.png",
        out: "vibe-coding-starter-kit-fileview.webp",
        width: 1600,
      },
    ],
  },
];

const OG_DIR = path.join(root, "public/og");
const SHOTS_DIR = path.join(root, "public/screenshots");

async function fetchBuffer(sourceUrl) {
  const res = await fetch(sourceUrl, {
    headers: { "user-agent": FETCH_UA },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`fetch ${sourceUrl} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function genOgCard(id, source) {
  fs.mkdirSync(OG_DIR, { recursive: true });
  const out = path.join(OG_DIR, `${id}.jpg`);
  const buffer = await fetchBuffer(source);
  await sharp(buffer)
    // 1200×630 (1.91:1) — matches the site card and BaseLayout's og:image meta.
    .resize(1200, 630, { fit: "cover", position: "top" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(out);
  console.log(`✓ ${path.relative(root, out)} (1200×630)`);
}

async function genScreenshot(shot) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const out = path.join(SHOTS_DIR, shot.out);
  const buffer = await fetchBuffer(shot.source);
  const info = await sharp(buffer)
    .resize({ width: shot.width, withoutEnlargement: true })
    .webp({ effort: 5, quality: 80 })
    .toFile(out);
  console.log(`✓ ${path.relative(root, out)} (${info.width}×${info.height})`);
}

for (const asset of ASSETS) {
  await genOgCard(asset.id, asset.ogSource);
  for (const shot of asset.screenshots ?? []) await genScreenshot(shot);
}
