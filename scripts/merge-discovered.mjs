#!/usr/bin/env node
/**
 * Merges every proposed entry in src/data/labs.discovered.json into labs.json.
 *
 * Discovery is treated as a unit of human review (one PR per week) — we don't
 * split "complete" from "incomplete" at merge time. The PR description surfaces
 * which entries need upstream metadata fixes; the maintainer either:
 *   - merges as-is and the TODO entries land with placeholders to polish later, or
 *   - fixes the upstream first, closes the PR, and lets next week's run pick it up.
 *
 * Behavior:
 *   - Appends new entries (skipping any whose id already exists).
 *   - Strips internal `_complete`, `_missing`, `_source` fields before merging.
 *   - Reports stale entries (catalog has them, source orgs don't) for manual review.
 *   - Removes the staging file when done.
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const labsPath = path.join(root, "src/data/labs.json");
const discoveredPath = path.join(root, "src/data/labs.discovered.json");

if (!fs.existsSync(discoveredPath)) {
  console.log("No labs.discovered.json. Run `npm run discover` first.");
  process.exit(0);
}

const labs = JSON.parse(fs.readFileSync(labsPath, "utf8"));
const discovered = JSON.parse(fs.readFileSync(discoveredPath, "utf8"));
const existingIds = new Set(labs.integrations.map((i) => i.id));

const strip = ({ _complete, _missing, _source, ...clean }) => clean;

const all = [...(discovered.complete ?? []), ...(discovered.incomplete ?? [])];
const added = [];
const skipped = [];

for (const e of all) {
  if (existingIds.has(e.id)) {
    skipped.push(e.id);
    continue;
  }
  labs.integrations.push(strip(e));
  existingIds.add(e.id);
  added.push(e.id);
}

if (added.length > 0) {
  fs.writeFileSync(labsPath, `${JSON.stringify(labs, null, 2)}\n`);
  console.log(`✔ Appended ${added.length} entries to labs.json:`);
  for (const id of added) console.log(`    + ${id}`);
} else {
  console.log("No new entries to merge.");
}

if (skipped.length > 0) {
  console.log(`\nSkipped ${skipped.length} (id already present): ${skipped.join(", ")}`);
}

const stale = discovered.stale ?? [];
if (stale.length > 0) {
  // We NEVER auto-remove entries. The script only surfaces issues — the
  // catalog is append-only via this tooling. Removals are a manual decision.
  const topicMissing = stale.filter((s) => s.severity === "topic-missing");
  const removed = stale.filter((s) => s.severity !== "topic-missing");
  if (topicMissing.length > 0) {
    console.log(
      `\n⚠  ${topicMissing.length} catalog entries lost their \`b2-labs\` topic — likely accidental:`,
    );
    for (const s of topicMissing)
      console.log(`  - ${s.id} (${s.repo}): re-add the topic on GitHub.`);
    console.log(
      "  These entries remain in labs.json. No action needed unless you really meant to remove them.",
    );
  }
  if (removed.length > 0) {
    console.log(`\n⚠  ${removed.length} catalog entries' repos are no longer in source orgs:`);
    for (const s of removed) console.log(`  - ${s.id} (${s.repo}): ${s.reason}`);
    console.log(
      "  These entries remain in labs.json. Decide manually: keep, edit, or hand-remove.",
    );
  }
}

fs.unlinkSync(discoveredPath);

if (added.length === 0 && stale.length === 0) {
  console.log("\nNothing to do.");
} else {
  console.log(
    "\nNext: review git diff of src/data/labs.json, polish TODO entries, npm run validate.",
  );
}
