#!/usr/bin/env node
/**
 * Schema-validates src/data/labs.json against src/data/labs.schema.json.
 * Also enforces a few cross-field rules ajv can't express:
 *   - integration.categories[] all reference an id in `categories`
 *   - integration.type references an id in `types`
 *   - integration.languages[] all reference an id in `languages`
 *   - integration.id is unique across the array
 *   - rendered external links use only http(s) URLs
 *   - detail images exist under public/ and match their declared pixel dimensions
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { isHttpUrl } from "../src/lib/url-safety.mjs";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dataPath = path.join(root, "src/data/labs.json");
const schemaPath = path.join(root, "src/data/labs.schema.json");
const statsPath = path.join(root, "src/data/github-stats.json");
const linksPath = path.join(root, "src/data/links.json");
const galleryPath = path.join(root, "src/components/Gallery.astro");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const stats = JSON.parse(fs.readFileSync(statsPath, "utf8"));
const links = JSON.parse(fs.readFileSync(linksPath, "utf8"));
const gallerySource = fs.readFileSync(galleryPath, "utf8");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const errors = [];
const warnings = [];

const publicDir = path.join(root, "public");

// sharp is a native binary reaching us transitively through astro. Its absence
// is fatal in CI — the dimension check is the only thing standing between
// labs.json and a fabricated width/height — but only a warning locally, so a
// broken native install can't block every commit.
let sharp = null;
try {
  ({ default: sharp } = await import("sharp"));
} catch (err) {
  const message = `detail images: sharp unavailable (${err.message}); pixel dimensions not verified`;
  if (process.env.CI) errors.push(message);
  else warnings.push(message);
}

function requireHttpUrl(context, value) {
  if (value != null && !isHttpUrl(value)) {
    errors.push(`${context}: must use an http(s) URL`);
  }
}

// The template renders `src` as a URL while this check resolves it as a file
// path, and the two disagree on strings like "//host/x.webp" (a path under
// public/, but a protocol-relative URL to another origin in the browser). So
// the accepted shape is pinned to exactly what gen-detail-assets emits, and
// anything else is refused rather than interpreted.
const DETAIL_IMAGE_SHAPES = {
  screenshot: /^\/screenshots\/[a-z0-9][a-z0-9._-]*\.webp$/,
  ogImage: /^\/og\/[a-z0-9][a-z0-9._-]*\.jpg$/,
};
const EXPECTED_FORMAT = { screenshot: "webp", ogImage: "jpeg" };

// Declared dimensions drive the rendered <img width/height>, and nothing else
// re-derives them — so a wrong number ships as silent layout shift.
async function assertDetailImage(context, kind, asset) {
  if (!asset || typeof asset.src !== "string") return; // the schema already reported it
  if (!DETAIL_IMAGE_SHAPES[kind].test(asset.src)) {
    errors.push(`${context}: src must match ${DETAIL_IMAGE_SHAPES[kind]} (got "${asset.src}")`);
    return;
  }
  const file = path.join(publicDir, asset.src.slice(1));
  if (path.relative(publicDir, file).startsWith("..")) {
    errors.push(`${context}: src escapes public/`);
    return;
  }
  if (!fs.existsSync(file)) {
    errors.push(`${context}: ${asset.src} does not exist under public/`);
    return;
  }
  if (!sharp) return;
  let meta;
  try {
    meta = await sharp(file).metadata();
  } catch (err) {
    errors.push(`${context}: ${asset.src} is unreadable or not a supported image (${err.message})`);
    return;
  }
  if (meta.width !== asset.width || meta.height !== asset.height) {
    errors.push(
      `${context}: declares ${asset.width}×${asset.height} but ${asset.src} is ${meta.width}×${meta.height}`,
    );
  }
  // The extension alone drives the advertised og:image MIME type, so the real
  // bytes have to agree with it.
  if (meta.format !== EXPECTED_FORMAT[kind]) {
    errors.push(
      `${context}: ${asset.src} contains ${meta.format} data, not ${EXPECTED_FORMAT[kind]}`,
    );
  }
  // Social cards below the standard size get cropped or ignored by link crawlers.
  if (kind === "ogImage" && (asset.width !== 1200 || asset.height !== 630)) {
    errors.push(`${context}: social cards must be 1200×630 (got ${asset.width}×${asset.height})`);
  }
}

function assertGallerySortConfig() {
  const sortModesMatch = gallerySource.match(/const sortModes = \[([\s\S]*?)\];/);
  const comparatorsMatch = gallerySource.match(/const SORT_COMPARATORS = \{([\s\S]*?)^ {2}\};/m);
  if (!sortModesMatch || !comparatorsMatch) {
    errors.push("Gallery.astro: unable to validate sort mode/comparator configuration");
    return;
  }
  const modeIds = [...sortModesMatch[1].matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);
  const comparatorIds = [...comparatorsMatch[1].matchAll(/^ {4}([a-z][\w-]*):/gm)].map(
    (match) => match[1],
  );
  const missingComparators = modeIds.filter((id) => !comparatorIds.includes(id));
  const missingModes = comparatorIds.filter((id) => !modeIds.includes(id));
  if (missingComparators.length || missingModes.length) {
    errors.push(
      `Gallery.astro: sort options/comparators mismatch; missing comparators [${missingComparators.join(
        ", ",
      )}], missing options [${missingModes.join(", ")}]`,
    );
  }
}

for (const unsafe of [
  "javascript:alert(1)",
  "data:text/html,<h1>x</h1>",
  "mailto:security@example.com",
]) {
  if (isHttpUrl(unsafe)) errors.push(`url safety: accepted unsafe scheme "${unsafe}"`);
}

assertGallerySortConfig();

if (!validate(data)) {
  for (const e of validate.errors ?? []) {
    errors.push(`schema: ${e.instancePath || "(root)"} ${e.message}`);
  }
}

const validCategoryIds = new Set(data.categories.map((c) => c.id));
const validTypeIds = new Set(data.types.map((t) => t.id));
const validLanguageIds = new Set(data.languages.map((l) => l.id));
const seenIds = new Set();

for (const i of data.integrations ?? []) {
  if (seenIds.has(i.id)) errors.push(`integrations: duplicate id "${i.id}"`);
  seenIds.add(i.id);

  for (const field of ["url", "site", "docs", "demo", "example"]) {
    requireHttpUrl(`integrations[${i.id}].${field}`, i[field]);
  }
  requireHttpUrl(`integrations[${i.id}].detail.license.url`, i.detail?.license?.url);

  if (i.detail) {
    for (const [n, shot] of (i.detail.screenshots ?? []).entries()) {
      await assertDetailImage(`integrations[${i.id}].detail.screenshots[${n}]`, "screenshot", shot);
    }
    await assertDetailImage(`integrations[${i.id}].detail.ogImage`, "ogImage", i.detail.ogImage);
  }

  for (const c of i.categories ?? []) {
    if (!validCategoryIds.has(c)) errors.push(`integrations[${i.id}]: unknown category "${c}"`);
  }
  if (!validTypeIds.has(i.type)) errors.push(`integrations[${i.id}]: unknown type "${i.type}"`);
  for (const l of i.languages ?? []) {
    if (!validLanguageIds.has(l)) {
      errors.push(`integrations[${i.id}]: unknown language "${l}"`);
    }
  }

  if (i.repo && !stats[i.id]) {
    warnings.push(`integrations[${i.id}]: repo "${i.repo}" has no github-stats entry`);
  }
}

for (const [id, companion] of Object.entries(links)) {
  if (!seenIds.has(id)) errors.push(`links[${id}]: no matching integration id`);
  for (const field of ["site", "docs", "demo", "example"]) {
    requireHttpUrl(`links[${id}].${field}`, companion[field]);
  }
  if (companion.repo != null && !/^[\w.-]+\/[\w.-]+$/.test(companion.repo)) {
    errors.push(`links[${id}].repo: must be an owner/repo slug`);
  }
}

if (errors.length) {
  console.error(`\n✖ labs.json validation failed (${errors.length}):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error("");
  process.exit(1);
}

if (warnings.length) {
  console.warn(`\n⚠ labs.json validation warnings (${warnings.length}):\n`);
  for (const w of warnings) console.warn(`  - ${w}`);
  console.warn("");
}

console.log(`✔ labs.json valid — ${data.integrations.length} integrations.`);
