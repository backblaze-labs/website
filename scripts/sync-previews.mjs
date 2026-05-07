#!/usr/bin/env node
import { Buffer } from "node:buffer";
/**
 * Discovers a representative preview image for every integration in labs.json
 * and writes the map to src/data/previews.json.
 *
 * Order of preference per integration:
 *   1. Explicit `preview` field in labs.json (manual override) — never touched here.
 *   2. First non-badge image in the repo's README (first-party entries).
 *   3. Upstream entries (no repo, or `type === "integration"`):
 *        a. First <video>/<source> in the page body (hero animations).
 *        b. First prominent <img> in the page body.
 *        c. og:image meta tag.
 *      Walks `site` first (where hero videos usually live), then `url`, and at
 *      each step tries the exact URL → origin root → apex domain.
 *   4. (no entry written) — caller renders the brand-gradient placeholder.
 *
 * GitHub's auto-generated social-preview cards (`opengraph.githubassets.com`)
 * are deliberately NOT used as a fallback — they ship with a fixed white
 * background and clash with the dark gallery aesthetic.
 *
 * Badges (shields.io, GitHub Actions, codecov, etc.) are filtered out so we
 * don't end up with a 100×20 build-status icon as the card hero.
 *
 * Diff-aware: the file is only rewritten when the resolved URL changes for
 * at least one entry — so the workflow doesn't churn daily commits.
 *
 * Auth: uses the `gh` CLI. CI: GH_TOKEN / GITHUB_TOKEN.
 *
 * Run: npm run sync-previews
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dataPath = path.join(root, "src/data/labs.json");
const outPath = path.join(root, "src/data/previews.json");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const existing = (() => {
  try {
    return JSON.parse(fs.readFileSync(outPath, "utf8"));
  } catch {
    return {};
  }
})();

function ghJSON(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("gh", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d;
    });
    proc.stderr.on("data", (d) => {
      stderr += d;
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0)
        reject(new Error(`gh ${args.join(" ")} → ${stderr.trim() || `exit ${code}`}`));
      else {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(new Error(`gh ${args.join(" ")} → bad JSON: ${e.message}`));
        }
      }
    });
  });
}

const BADGE_HOSTS =
  /(shields\.io|img\.shields\.io|badge\.fury\.io|badgen\.net|codecov\.io|coveralls\.io|circleci\.com|travis-ci|app\.bors\.tech|deepscan\.io|codeclimate\.com|gitter\.im\/.*badge|sonarcloud\.io|app\.netlify\.com|api\.netlify\.com|app\.codacy\.com|david-dm\.org|api\.bintray\.com|api\.codeclimate\.com|api\.dependabot\.com|api\.snyk\.io|libraries\.io|app\.fossa\.com|app\.fossa\.io|deps\.rs|awesome\.re|mypy-lang\.org|google\.github\.io\/styleguide|forthebadge\.com|isitmaintained\.com|github\.com\/[^/]+\/[^/]+\/actions\/workflows|github\.com\/[^/]+\/[^/]+\/workflows)/i;

const BADGE_PATH = /\/(?:[\w-]*-?(?:badge|shield)s?[\w-]*)\.(?:svg|png|gif|webp)(?:[?#]|$)/i;

function extractImagesFromReadme(md, repo, defaultBranch) {
  const images = [];
  for (const m of md.matchAll(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g)) {
    images.push({ url: m[2], alt: m[1] ?? "" });
  }
  for (const m of md.matchAll(
    /<img\s+[^>]*src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*>/gi,
  )) {
    images.push({ url: m[1], alt: m[2] ?? "" });
  }
  return images.map((img) => ({ ...img, url: absolutize(img.url, repo, defaultBranch) }));
}

function absolutize(u, repo, branch) {
  if (!u) return u;
  if (/^https?:\/\//.test(u)) return u;
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("data:")) return u;
  const clean = u.replace(/^\.?\//, "");
  return `https://raw.githubusercontent.com/${repo}/${branch}/${clean}`;
}

function isBadge(img) {
  if (!img.url) return true;
  if (BADGE_HOSTS.test(img.url)) return true;
  if (BADGE_PATH.test(img.url)) return true;
  if (/\b(badge|shield|status|build|coverage|license)\b/i.test(img.alt)) return true;
  return false;
}

function pickPreview(images) {
  const real = images.filter((img) => !isBadge(img) && !img.url.startsWith("data:"));
  return real[0]?.url ?? null;
}

// Hosts that occasionally serve HTML that triggers anti-bot interstitials when
// hit with a non-browser user-agent. We use a realistic UA across the board so
// we get the same HTML a normal visitor sees (matters for Webflow / Cloudflare
// fronted sites like cvat.ai).
const FETCH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";

// Fetch a page's HTML up to a size cap. Larger cap than just-the-head so we
// can also scan the body for visible <img>/<video> tags, not just meta tags.
async function fetchHtml(targetUrl, maxBytes = 1024 * 1024) {
  if (!targetUrl) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(targetUrl, {
      signal: ctl.signal,
      redirect: "follow",
      headers: {
        "user-agent": FETCH_UA,
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("html")) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    let bytes = 0;
    let html = "";
    const dec = new TextDecoder();
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += dec.decode(value, { stream: true });
    }
    try {
      reader.cancel();
    } catch {}
    return html;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Confirm a discovered preview URL actually serves a usable image/video before
// we commit it to previews.json — some sites point their og:image at internal
// optimisation endpoints (e.g. Mintlify's Next.js `_next/image?url=...`) that
// return 400 when hit cross-origin. Shipping those silently embeds a broken
// `<img>` icon in every card. We send a HEAD first; if the host doesn't honor
// HEAD (some CDNs return 405) we follow up with a tiny ranged GET. Returns
// true only on a 2xx with an `image/*` or `video/*` content-type.
async function verifyMediaUrl(targetUrl) {
  if (!targetUrl) return false;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  const looksOk = (res) => {
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    return ct.startsWith("image/") || ct.startsWith("video/");
  };
  try {
    const head = await fetch(targetUrl, {
      method: "HEAD",
      signal: ctl.signal,
      redirect: "follow",
      headers: { "user-agent": FETCH_UA, accept: "image/*,video/*;q=0.9,*/*;q=0.5" },
    });
    if (looksOk(head)) return true;
    // 405 / 501 / etc. — fall back to a ranged GET that streams ~1KB.
    if (head.status >= 400 && head.status < 500 && head.status !== 405) return false;
    const get = await fetch(targetUrl, {
      method: "GET",
      signal: ctl.signal,
      redirect: "follow",
      headers: {
        "user-agent": FETCH_UA,
        accept: "image/*,video/*;q=0.9,*/*;q=0.5",
        range: "bytes=0-1023",
      },
    });
    try {
      get.body?.cancel?.();
    } catch {}
    return looksOk(get);
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

// HTML attribute values keep their entity-escaping (e.g. `&amp;`, `&#x2F;`).
// URLs that flow back into our JSON / src attributes need the raw form, or
// they get double-encoded when Astro re-escapes for HTML output (e.g.
// `?a=1&amp;b=2` → `?a=1&amp;amp;b=2` and the query breaks).
function decodeHtmlEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number.parseInt(d, 10)));
}

function absoluteUrl(maybeRelative, basePageUrl) {
  const img = decodeHtmlEntities((maybeRelative ?? "").trim());
  if (!img) return null;
  if (img.startsWith("//")) return `https:${img}`;
  if (/^https?:\/\//.test(img)) return img;
  try {
    if (img.startsWith("/")) {
      const u = new URL(basePageUrl);
      return `${u.protocol}//${u.host}${img}`;
    }
    return new URL(img, basePageUrl).toString();
  } catch {
    return null;
  }
}

// Best-effort host extraction for filtering — `src` may still be relative
// (e.g. `/icons/foo.svg`); resolve against the page URL before checking.
function srcHost(src, basePageUrl) {
  try {
    return new URL(src, basePageUrl).host.toLowerCase();
  } catch {
    return "";
  }
}

// Extract the first prominent <img> inside the page <body> — the actual
// visible image on the site, not a meta tag. Filters out tiny icons, badges,
// favicons, sprite-style decoration, and SVG arrow/chevron junk.
function extractFirstBodyImage(html, basePageUrl) {
  if (!html) return null;
  // Only consider <body> content (skip <head> which is for meta/favicons).
  const bodyStart = html.search(/<body[^>]*>/i);
  const body = bodyStart >= 0 ? html.slice(bodyStart) : html;

  for (const m of body.matchAll(/<img\s+[^>]*?>/gi)) {
    const tag = m[0];
    const src =
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ??
      tag.match(/\bsrcset=["']([^"',]+)/i)?.[1] ??
      null;
    if (!src) continue;
    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1] ?? "";
    const widthAttr = Number.parseInt(tag.match(/\bwidth=["']?(\d+)/i)?.[1] ?? "0", 10);
    const heightAttr = Number.parseInt(tag.match(/\bheight=["']?(\d+)/i)?.[1] ?? "0", 10);

    // Skip badges and shields.
    if (BADGE_HOSTS.test(src)) continue;
    if (BADGE_PATH.test(src)) continue;
    if (/\b(badge|shield|status|build|coverage|license)\b/i.test(alt)) continue;
    // Skip obvious tiny decorations.
    if ((widthAttr > 0 && widthAttr < 80) || (heightAttr > 0 && heightAttr < 80)) continue;
    // Skip favicons and apple-touch icons.
    if (/\b(favicon|apple-touch|sprite)\b/i.test(src)) continue;
    // Skip arrows/chevrons/expand-icons/etc. that often appear before content.
    if (/\b(arrow|chevron|caret|hamburger|menu-icon)\b/i.test(src)) continue;
    // Skip nav/branding artwork — site logos and wordmarks are usually small
    // transparent SVGs that look bad stretched to fill a 16:6 card. The brand
    // gradient placeholder reads better in their absence.
    if (/\b(logo|wordmark|brand-?mark)\b/i.test(`${alt} ${src}`)) continue;
    // Skip generic decorative iconography — tiny icons used inline for
    // "run in colab", "view on github", etc. They're not page heroes.
    if (/[_-]icon\b|[_-]pic\b|\bicon[_-]/i.test(src)) continue;
    if (/\bicon\b/i.test(alt)) continue;
    // Hosts whose images are never the page's hero artwork — encyclopaedia
    // illustrations, video-platform thumbnails, third-party badge mirrors.
    // Skipping these lets the upstream walk fall through to the apex domain
    // (e.g. project marketing site) which usually does have real hero art.
    if (
      /(?:^|\.)(?:wikimedia\.org|wikipedia\.org|img\.youtube\.com|i\.ytimg\.com|i\.vimeocdn\.com)$/i.test(
        srcHost(src, basePageUrl),
      )
    )
      continue;
    if (src.startsWith("data:")) continue;

    const abs = absoluteUrl(src, basePageUrl);
    if (abs) return abs;
  }
  return null;
}

// Extract the first usable video <source> (or `src` on the <video> tag) from
// the page body. Prefers .mp4 (broadest browser support), then .webm. Many
// modern marketing sites (Webflow, Framer, etc.) embed hero animations as
// autoplay/loop/muted videos — when present these make the best card preview.
function extractFirstBodyVideo(html, basePageUrl) {
  if (!html) return null;
  const bodyStart = html.search(/<body[^>]*>/i);
  const body = bodyStart >= 0 ? html.slice(bodyStart) : html;

  for (const m of body.matchAll(/<video\b([^>]*)>([\s\S]*?)<\/video>/gi)) {
    const attrs = m[1] ?? "";
    const inner = m[2] ?? "";

    // Collect candidate URLs in priority order: <source src> tags first, then
    // the <video src> attribute as a last resort.
    const candidates = [];
    for (const s of inner.matchAll(/<source\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
      const type = s[0].match(/\btype=["']([^"']+)["']/i)?.[1] ?? "";
      candidates.push({ src: s[1], type });
    }
    const videoSrc = attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (videoSrc) candidates.push({ src: videoSrc, type: "" });
    if (candidates.length === 0) continue;

    // Prefer mp4 (Safari + everywhere), then webm, then anything.
    const score = (c) => {
      const lower = `${c.src} ${c.type}`.toLowerCase();
      if (lower.includes(".mp4") || lower.includes("mp4")) return 0;
      if (lower.includes(".webm") || lower.includes("webm")) return 1;
      return 2;
    };
    candidates.sort((a, b) => score(a) - score(b));
    const abs = absoluteUrl(candidates[0].src, basePageUrl);
    if (abs) return abs;
  }
  return null;
}

// Hosts whose og:image we deliberately reject. GitHub's auto-generated
// social-preview cards ship with a fixed white background and read poorly in
// the dark gallery — better to fall back to the placeholder than embed a
// card-within-a-card with the wrong colour scheme.
const REJECTED_OG_HOSTS = /(?:^|\.)opengraph\.githubassets\.com$/i;

function extractOgImage(html, basePageUrl) {
  if (!html) return null;
  const m =
    html.match(/<meta[^>]+property=["']?og:image["']?[^>]+content=["']?([^"'\s>]+)/i) ||
    html.match(/<meta[^>]+content=["']?([^"'\s>]+)[^>]+property=["']?og:image["']?/i);
  if (!m) return null;
  const abs = absoluteUrl(m[1], basePageUrl);
  if (!abs) return null;
  try {
    if (REJECTED_OG_HOSTS.test(new URL(abs).host)) return null;
  } catch {
    return null;
  }
  return abs;
}

// Resolve a "real" preview from one or more upstream URLs. Strategy:
//   1. First <video>/<source> in the page body (preferred — hero animations
//      make the best previews when sites have them).
//   2. First prominent <img> in the page body.
//   3. og:image meta tag as fallback.
//   4. Walks up the URL chain at each seed (exact → origin root → apex) so
//      deep-link docs pages still resolve to the project's brand imagery.
//
// `seeds` is a list of starting URLs in priority order — typically [site, url]
// so the marketing site (which usually has a hero <video>) is tried before the
// docs URL (which usually doesn't).
//
// Hosts whose pages we never extract previews from. github.com only ever
// yields UI chrome (avatars, sprites like `particles.png`) when scanned for
// images — better to fall through to the placeholder than ship a card with a
// 1px GitHub decoration as the hero.
const SKIP_PREVIEW_HOSTS =
  /(?:^|\.)(?:github\.com|github\.githubassets\.com|opengraph\.githubassets\.com)$/i;

// True when a previously-stored URL is on a host we no longer accept (GitHub
// chrome/sprite images, auto-generated OG cards). Used to discard stale
// `previews.json` entries instead of "kept previous"-ing them.
function isUnacceptablePreview(u) {
  if (!u) return true;
  try {
    return SKIP_PREVIEW_HOSTS.test(new URL(u).host);
  } catch {
    return true;
  }
}

async function fetchUpstreamPreview(seeds) {
  const list = Array.isArray(seeds) ? seeds.filter(Boolean) : [seeds].filter(Boolean);
  if (list.length === 0) return null;

  const tries = [];
  const seen = new Set();
  const push = (u) => {
    if (!u) return;
    try {
      if (SKIP_PREVIEW_HOSTS.test(new URL(u).host)) return;
    } catch {
      return;
    }
    const norm = u.replace(/\/+$/, "/");
    if (seen.has(norm)) return;
    seen.add(norm);
    tries.push(u);
  };
  for (const seed of list) {
    push(seed);
    try {
      const u = new URL(seed);
      if (u.pathname !== "/" || u.search) push(`${u.protocol}//${u.host}/`);
      const apex = u.host.replace(/^(docs|www|api|blog|developer|developers)\./i, "");
      if (apex !== u.host) push(`${u.protocol}//${apex}/`);
    } catch {}
  }

  for (const url of tries) {
    const html = await fetchHtml(url);
    if (!html) continue;
    const video = extractFirstBodyVideo(html, url);
    if (video && (await verifyMediaUrl(video))) return { url: video, source: "video" };
    const body = extractFirstBodyImage(html, url);
    if (body && (await verifyMediaUrl(body))) return { url: body, source: "body" };
    const og = extractOgImage(html, url);
    if (og && (await verifyMediaUrl(og))) return { url: og, source: "og" };
  }
  return null;
}

async function processOne(i) {
  // Upstream-integration entries pull from the destination URL's og:image even
  // if a `repo` is set — `repo` on these entries is just for stats and the
  // "Code" link icon, not for picking the card preview. (Without this rule,
  // MLflow with `repo: mlflow/mlflow` would walk that repo's giant README and
  // miss the carefully-designed mlflow-card.png on mlflow.org.)
  const isUpstream = i.type === "integration" || !i.repo;
  if (isUpstream) {
    if (!i.url) return { id: i.id, status: "skip", line: null };
    try {
      // Try the marketing `site` first (where hero videos usually live), then
      // fall through to the docs/PR URL. Docs pages rarely have <video> but
      // often have inline screenshots, so they're a useful image fallback.
      const seeds = [i.site, i.url].filter(Boolean);
      const found = await fetchUpstreamPreview(seeds);
      if (found) {
        const sourceTag =
          found.source === "video"
            ? "upstream-video"
            : found.source === "body"
              ? "upstream-body"
              : "upstream-og";
        const label =
          found.source === "video" ? "video" : found.source === "body" ? "body image" : "og image";
        return {
          id: i.id,
          status: "ok",
          url: found.url,
          source: sourceTag,
          line: `  ${i.id} (upstream → ${new URL(i.url).host}) ... ${label} (${new URL(found.url).host})`,
        };
      }
      const prev = isUnacceptablePreview(existing[i.id]) ? null : existing[i.id];
      return {
        id: i.id,
        status: "ok",
        url: prev,
        source: prev ? "kept" : "placeholder",
        line: `  ${i.id} (upstream → ${new URL(i.url).host}) ... no image → ${prev ? "kept previous" : "placeholder"}`,
      };
    } catch (err) {
      const prev = isUnacceptablePreview(existing[i.id]) ? null : existing[i.id];
      return {
        id: i.id,
        status: "failed",
        url: prev,
        source: prev ? "kept" : "placeholder",
        line: `  ${i.id} (upstream) ... failed (${err.message.split("\n")[0]}) → ${prev ? "kept previous" : "placeholder"}`,
      };
    }
  }
  try {
    const [readme, repoMeta] = await Promise.all([
      ghJSON(["api", `repos/${i.repo}/readme`]),
      ghJSON(["api", `repos/${i.repo}`, "--jq", "{default_branch}"]),
    ]);
    const md = Buffer.from(readme.content, readme.encoding || "base64").toString("utf8");
    const branch = repoMeta.default_branch || "HEAD";
    const images = extractImagesFromReadme(md, i.repo, branch);
    const picked = pickPreview(images);
    // Verify the README image actually loads. raw.githubusercontent.com paths
    // can break silently when a README references a moved/renamed asset.
    if (picked && (await verifyMediaUrl(picked))) {
      return {
        id: i.id,
        status: "ok",
        url: picked,
        source: "readme",
        line: `  ${i.repo} ... README image (${new URL(picked).host})`,
      };
    }
    return {
      id: i.id,
      status: "ok",
      url: null,
      source: "placeholder",
      line: `  ${i.repo} ... no usable README image → placeholder`,
    };
  } catch (err) {
    const prev =
      existing[i.id] && !/opengraph\.githubassets\.com/i.test(existing[i.id])
        ? existing[i.id]
        : null;
    return {
      id: i.id,
      status: "failed",
      url: prev,
      source: prev ? "kept" : "placeholder",
      line: `  ${i.repo} ... failed (${err.message.split("\n")[0]}) → ${prev ? "kept previous" : "placeholder"}`,
    };
  }
}

const results = await Promise.all(data.integrations.map(processOne));
const orderById = new Map(data.integrations.map((i, idx) => [i.id, idx]));
results.sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));
for (const r of results) if (r.line) console.log(r.line);

const out = {};
let ok = 0;
let fail = 0;
let fromReadme = 0;
let fromUpstreamVideo = 0;
let fromUpstreamBody = 0;
let fromUpstreamOg = 0;
let placeholders = 0;
for (const r of results) {
  if (r.status === "ok") ok++;
  else if (r.status === "failed") fail++;
  if (r.url) out[r.id] = r.url;
  if (r.source === "readme") fromReadme++;
  else if (r.source === "upstream-video") fromUpstreamVideo++;
  else if (r.source === "upstream-body") fromUpstreamBody++;
  else if (r.source === "upstream-og") fromUpstreamOg++;
  else if (r.source === "placeholder") placeholders++;
}

const sorted = Object.fromEntries(
  Object.keys(out)
    .sort()
    .map((k) => [k, out[k]]),
);
const nextJson = `${JSON.stringify(sorted, null, 2)}\n`;
const prevJson = (() => {
  try {
    return fs.readFileSync(outPath, "utf8");
  } catch {
    return null;
  }
})();

const summary = `${ok} ok, ${fail} failed · ${fromReadme} README · ${fromUpstreamVideo} upstream video · ${fromUpstreamBody} upstream body · ${fromUpstreamOg} upstream og · ${placeholders} placeholder`;
if (nextJson !== prevJson) {
  fs.writeFileSync(outPath, nextJson);
  console.log(`\n✔ Wrote ${path.relative(root, outPath)} — ${summary}.`);
} else {
  console.log(`\n✔ No changes — ${summary}. (file untouched)`);
}
if (fail > 0) process.exitCode = 1;
