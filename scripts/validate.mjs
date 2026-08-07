#!/usr/bin/env node
/**
 * Schema-validates src/data/labs.json against src/data/labs.schema.json.
 * Also enforces a few cross-field rules ajv can't express:
 *   - integration.categories[] all reference an id in `categories`
 *   - integration.type references an id in `types`
 *   - integration.languages[] all reference an id in `languages`
 *   - integration.id is unique across the array
 *   - rendered external links use only http(s) URLs
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dataPath = path.join(root, "src/data/labs.json");
const schemaPath = path.join(root, "src/data/labs.schema.json");
const statsPath = path.join(root, "src/data/github-stats.json");
const linksPath = path.join(root, "src/data/links.json");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const stats = JSON.parse(fs.readFileSync(statsPath, "utf8"));
const links = JSON.parse(fs.readFileSync(linksPath, "utf8"));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const errors = [];
const warnings = [];

function isHttpUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function requireHttpUrl(context, value) {
  if (value != null && !isHttpUrl(value)) {
    errors.push(`${context}: must use an http(s) URL`);
  }
}

for (const unsafe of [
  "javascript:alert(1)",
  "data:text/html,<h1>x</h1>",
  "mailto:security@example.com",
]) {
  if (isHttpUrl(unsafe)) errors.push(`url safety: accepted unsafe scheme "${unsafe}"`);
}

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
