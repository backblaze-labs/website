import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { FETCH_UA } from "./_http.mjs";

const THUMB_WIDTH = 640;
const THUMB_HEIGHT = 240;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const PREVIEW_DIR = "previews";

function safeId(id) {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isRemoteHttp(u) {
  return /^https?:\/\//i.test(u ?? "");
}

function isLikelyVideo(u) {
  return /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(u ?? "");
}

function isLikelyAnimatedImage(u) {
  return /\.gif(?:[?#]|$)/i.test(u ?? "");
}

function localPreviewPath(root, rel) {
  if (!rel?.startsWith(`/${PREVIEW_DIR}/`)) return null;
  return path.join(root, "public", rel.replace(/^\//, ""));
}

function reusableLocalPreview(root, existingPreview) {
  const filePath = localPreviewPath(root, existingPreview);
  if (!filePath || !fs.existsSync(filePath)) return null;
  return existingPreview;
}

async function fetchImageBuffer(sourceUrl) {
  if (!isRemoteHttp(sourceUrl) || isLikelyVideo(sourceUrl)) return null;

  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(sourceUrl, {
      signal: ctl.signal,
      redirect: "follow",
      headers: {
        "user-agent": FETCH_UA,
        accept: "image/avif,image/webp,image/*;q=0.9,*/*;q=0.2",
      },
    });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("image/")) return null;

    const declaredLength = Number.parseInt(res.headers.get("content-length") ?? "0", 10);
    if (declaredLength > MAX_SOURCE_BYTES) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_SOURCE_BYTES) return null;
    return buffer;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function writeThumbnail(root, id, sourceUrl, buffer) {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12);
  const filename = `${safeId(id)}-${hash}.webp`;
  const rel = `/${PREVIEW_DIR}/${filename}`;
  const dir = path.join(root, "public", PREVIEW_DIR);
  const out = path.join(dir, filename);

  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(out)) {
    await sharp(buffer, { animated: false, limitInputPixels: 80_000_000 })
      .rotate()
      .resize({
        width: THUMB_WIDTH,
        height: THUMB_HEIGHT,
        fit: "cover",
        position: "top",
        withoutEnlargement: true,
      })
      .webp({ effort: 5, quality: 74 })
      .toFile(out);
  }

  return {
    rel,
    sourceBytes: buffer.byteLength,
    sourceUrl,
    thumbnailBytes: fs.statSync(out).size,
  };
}

function pruneUnused(root, referencedUrls) {
  const dir = path.join(root, "public", PREVIEW_DIR);
  if (!fs.existsSync(dir)) return 0;
  const referenced = new Set(
    referencedUrls.filter((u) => u?.startsWith(`/${PREVIEW_DIR}/`)).map((u) => path.basename(u)),
  );
  let removed = 0;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".webp")) continue;
    if (referenced.has(file)) continue;
    fs.unlinkSync(path.join(dir, file));
    removed++;
  }
  return removed;
}

export async function optimizePreviewSources(sourceMap, { root, existingPreviews = {} }) {
  const optimized = {};
  const stats = {
    optimized: 0,
    kept: 0,
    skipped: 0,
    animated: 0,
    removed: 0,
    sourceBytes: 0,
    thumbnailBytes: 0,
  };

  for (const [id, sourceUrl] of Object.entries(sourceMap)) {
    if (isLikelyVideo(sourceUrl) || isLikelyAnimatedImage(sourceUrl)) {
      optimized[id] = sourceUrl;
      stats.animated++;
      continue;
    }

    const existing = reusableLocalPreview(root, existingPreviews[id]);
    const buffer = await fetchImageBuffer(sourceUrl);

    if (!buffer) {
      if (existing) {
        optimized[id] = existing;
        stats.kept++;
      } else {
        stats.skipped++;
      }
      continue;
    }

    try {
      const result = await writeThumbnail(root, id, sourceUrl, buffer);
      optimized[id] = result.rel;
      stats.optimized++;
      stats.sourceBytes += result.sourceBytes;
      stats.thumbnailBytes += result.thumbnailBytes;
    } catch {
      if (existing) {
        optimized[id] = existing;
        stats.kept++;
      } else {
        stats.skipped++;
      }
    }
  }

  stats.removed = pruneUnused(root, Object.values(optimized));
  return { optimized, stats };
}
