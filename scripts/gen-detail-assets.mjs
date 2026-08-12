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
import os from "node:os";
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
// Any explicit argument means the caller wants CLI mode. Deciding on `--id`
// alone would silently regenerate every curated asset when a caller passes
// `--shot` and forgets `--id`, overwriting committed artwork.
const cliMode = process.argv.slice(2).length > 0;
// stdout carries the JSON result in CLI mode, so progress has to go to stderr.
const log = cliMode ? console.error : console.log;

function fail(message) {
  console.error(`gen-detail-assets: ${message}`);
  process.exit(1);
}

// Matches the caps the preview optimizer already applies to untrusted artwork.
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12000;

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

// Sources can come from an automated caller, so a bad URL must fail fast and
// small rather than hang the publisher or exhaust memory. The URL is never
// echoed back on failure — a presigned source would carry credentials in its
// query string.
async function fetchBuffer(sourceUrl) {
  const host = new URL(sourceUrl).host;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(sourceUrl, {
      signal: ctl.signal,
      headers: { "user-agent": FETCH_UA, accept: "image/*;q=0.9,*/*;q=0.2" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`fetch from ${host} → ${res.status}`);
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      throw new Error(`source from ${host} is ${contentType || "an unknown type"}, not an image`);
    }
    const declared = Number.parseInt(res.headers.get("content-length") ?? "0", 10);
    if (declared > MAX_SOURCE_BYTES) throw new Error(`source from ${host} exceeds 12MB`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_SOURCE_BYTES) throw new Error(`source from ${host} exceeds 12MB`);
    return buffer;
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`source from ${host} timed out`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// A source is a remote URL or a path on disk, so the same generator serves both
// the curated ASSETS list and an automated caller working from local captures.
async function loadBuffer(source) {
  if (/^https?:\/\//i.test(source)) return fetchBuffer(source);
  const file = path.resolve(source);
  if (fs.statSync(file).size > MAX_SOURCE_BYTES) {
    throw new Error(`${path.basename(file)} exceeds 12MB`);
  }
  return fs.readFileSync(file);
}

// `.rotate()` applies any EXIF orientation before resizing. Without it a photo
// tagged "rotate 90°" keeps its stored dimensions while the tag is dropped, so
// the measured width/height we report would describe the wrong picture.
async function genOgCard(id, source, dir = OG_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${id}.jpg`);
  const info = await sharp(await loadBuffer(source))
    .rotate()
    // 1200×630 (1.91:1) — matches the site card and BaseLayout's og:image meta.
    .resize(1200, 630, { fit: "cover", position: "top" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(out);
  log(`✓ og/${id}.jpg (${info.width}×${info.height})`);
  return { src: `/og/${id}.jpg`, width: info.width, height: info.height, file: out };
}

async function genScreenshot(shot, dir = SHOTS_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, shot.out);
  const info = await sharp(await loadBuffer(shot.source))
    .rotate()
    .resize({ width: shot.width, withoutEnlargement: true })
    .webp({ effort: 5, quality: 80 })
    .toFile(out);
  log(`✓ screenshots/${shot.out} (${info.width}×${info.height})`);
  return { src: `/screenshots/${shot.out}`, width: info.width, height: info.height, file: out };
}

// An automated caller supplies the id, and it lands in a filesystem path — so
// anything but a plain slug is refused rather than normalized.
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

if (cliMode) {
  const id = argv.id;
  const shots = argv.shot ?? [];
  if (id === undefined) fail("--id is required (pass no arguments to regenerate the curated set)");
  if (!ID_RE.test(id)) fail(`--id must match ${ID_RE} (got "${id}")`);
  if (shots.length === 0) fail("at least one --shot <url|path> is required");

  // Build everything in a staging directory and move it into public/ only once
  // the whole batch has succeeded. A half-generated set left on disk would
  // otherwise be picked up by the next `git add`.
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "gen-detail-assets-"));
  try {
    // The hero screenshot doubles as the OG source, matching the curated entries.
    const ogImage = await genOgCard(id, argv.og ?? shots[0], path.join(stage, "og"));
    const screenshots = [];
    for (const [index, source] of shots.entries()) {
      screenshots.push(
        await genScreenshot(
          { source, out: `${id}-${index + 1}.webp`, width: 1600 },
          path.join(stage, "screenshots"),
        ),
      );
    }
    fs.mkdirSync(OG_DIR, { recursive: true });
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    for (const asset of [ogImage, ...screenshots]) {
      fs.renameSync(asset.file, path.join(root, "public", asset.src.replace(/^\//, "")));
      delete asset.file;
    }
    process.stdout.write(`${JSON.stringify({ id, ogImage, screenshots })}\n`);
  } catch (err) {
    fail(err.message);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
} else {
  for (const asset of ASSETS) {
    await genOgCard(asset.id, asset.ogSource);
    for (const shot of asset.screenshots ?? []) await genScreenshot(shot);
  }
}
