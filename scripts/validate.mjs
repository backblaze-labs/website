#!/usr/bin/env node
/**
 * Schema-validates src/data/labs.json against src/data/labs.schema.json.
 * Also enforces a few cross-field rules ajv can't express:
 *   - integration.categories[] all reference an id in `categories`
 *   - integration.type references an id in `types`
 *   - integration.language references an id in `languages`
 *   - integration.id is unique across the array
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

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const errors = [];

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

  for (const c of i.categories ?? []) {
    if (!validCategoryIds.has(c)) errors.push(`integrations[${i.id}]: unknown category "${c}"`);
  }
  if (!validTypeIds.has(i.type)) errors.push(`integrations[${i.id}]: unknown type "${i.type}"`);
  if (!validLanguageIds.has(i.language)) {
    errors.push(`integrations[${i.id}]: unknown language "${i.language}"`);
  }
}

if (errors.length) {
  console.error(`\n✖ labs.json validation failed (${errors.length}):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error("");
  process.exit(1);
}

console.log(`✔ labs.json valid — ${data.integrations.length} integrations.`);
