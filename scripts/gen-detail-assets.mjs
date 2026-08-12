// Manual, dev-only generator for per-detail-page image assets. Run after the
// upstream source artwork changes — like scripts/gen-og-assets.mjs, the outputs
// are committed to `public/`, so the build itself never fetches or shells out
// to sharp.
//
//   npm run gen-detail-assets                 regenerate every asset in ASSETS below
//
// It also takes explicit sources, so an automated publisher can generate the
// assets for a project that isn't listed here:
//
//   node scripts/gen-detail-assets.mjs --id <catalog-id> \
//     [--og <url|path>] --shot <url|path> [--shot <url|path> ...]
//
// In that mode progress goes to stderr and exactly one JSON object is written to
// stdout, reporting each output's path and its real pixel dimensions:
//
//   {"id":"…","ogImage":{"src":"/og/….jpg","width":1200,"height":630},
//    "screenshots":[{"src":"/screenshots/…-1.webp","width":1600,"height":887}]}
//
// The dimensions are read back from sharp rather than assumed: `withoutEnlargement`
// means a 900px-wide source yields a 900px-wide output, and labs.json declares
// exact width/height that nothing downstream can re-derive.
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
import { parseArgs } from "node:util";
import sharp from "sharp";
import { FETCH_UA } from "./_http.mjs";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");

const { values: argv } = parseArgs({
  options: {
    id: { type: "string" },
    og: { type: "string" },
    shot: { type: "string", multiple: true },
  },
  strict: true,
});
const cliMode = argv.id !== undefined;
// stdout carries the JSON result in CLI mode, so progress has to go to stderr.
const log = cliMode ? console.error : console.log;

function fail(message) {
  console.error(`gen-detail-assets: ${message}`);
  process.exit(1);
}

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
    // thumbnails). The dashboard doubles as the high-res hero shot; the card
    // thumbnail in public/previews/ (built by sync-previews) is unaffected.
    screenshots: [
      {
        source:
          "https://raw.githubusercontent.com/backblaze-b2-samples/vibe-coding-starter-kit/main/docs/images/b2-starterkit-dashboard1.png",
        out: "vibe-coding-starter-kit-dashboard.webp",
        width: 1600,
      },
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

// A source is a remote URL or a path on disk, so the same generator serves both
// the curated ASSETS list and an automated caller working from local captures.
async function loadBuffer(source) {
  if (/^https?:\/\//i.test(source)) return fetchBuffer(source);
  return fs.readFileSync(path.resolve(source));
}

async function genOgCard(id, source) {
  fs.mkdirSync(OG_DIR, { recursive: true });
  const out = path.join(OG_DIR, `${id}.jpg`);
  const buffer = await loadBuffer(source);
  const info = await sharp(buffer)
    // 1200×630 (1.91:1) — matches the site card and BaseLayout's og:image meta.
    .resize(1200, 630, { fit: "cover", position: "top" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(out);
  log(`✓ ${path.relative(root, out)} (${info.width}×${info.height})`);
  return { src: `/og/${id}.jpg`, width: info.width, height: info.height };
}

async function genScreenshot(shot) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const out = path.join(SHOTS_DIR, shot.out);
  const buffer = await loadBuffer(shot.source);
  const info = await sharp(buffer)
    .resize({ width: shot.width, withoutEnlargement: true })
    .webp({ effort: 5, quality: 80 })
    .toFile(out);
  log(`✓ ${path.relative(root, out)} (${info.width}×${info.height})`);
  return { src: `/screenshots/${shot.out}`, width: info.width, height: info.height };
}

// An automated caller supplies the id, and it lands in a filesystem path — so
// anything but a plain slug is refused rather than normalized.
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

if (cliMode) {
  const id = argv.id;
  const shots = argv.shot ?? [];
  if (!ID_RE.test(id)) fail(`--id must match ${ID_RE} (got "${id}")`);
  if (shots.length === 0) fail("at least one --shot <url|path> is required");
  // The hero screenshot doubles as the OG source, matching the curated entries.
  const ogImage = await genOgCard(id, argv.og ?? shots[0]);
  const screenshots = [];
  for (const [index, source] of shots.entries()) {
    screenshots.push(await genScreenshot({ source, out: `${id}-${index + 1}.webp`, width: 1600 }));
  }
  process.stdout.write(`${JSON.stringify({ id, ogImage, screenshots })}\n`);
} else {
  for (const asset of ASSETS) {
    await genOgCard(asset.id, asset.ogSource);
    for (const shot of asset.screenshots ?? []) await genScreenshot(shot);
  }
}
