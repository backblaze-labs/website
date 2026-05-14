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

// Featured-flag reconciliation: the tracker label `B2 Feature on website` is
// the source of truth. For every entry id in the reconciliation map (built by
// discover.mjs from closed sub-issue labels), force the catalog entry's
// `featured` to match. Adds the flag when the label is present, clears it when
// the label is removed. The map intentionally only includes ids that came from
// the tracker — entries with no tracker counterpart keep their current
// `featured` value (curators can still hand-flip those).
const reconciliation = discovered.featuredReconciliation ?? {};
const featuredFlips = [];
for (const e of labs.integrations) {
  if (!(e.id in reconciliation)) continue;
  const desired = Boolean(reconciliation[e.id]);
  if (Boolean(e.featured) === desired) continue;
  featuredFlips.push({ id: e.id, from: Boolean(e.featured), to: desired });
  e.featured = desired;
}

// TODO-placeholder auto-refresh: when an existing catalog entry's tagline or
// description still reads `"TODO: …"` (because the repo description was empty
// when the entry first landed) and the upstream repo description has since
// been filled in, replace the placeholder with the fresh upstream value.
//
// Conservative on purpose — we ONLY touch fields that still match the
// `TODO:` prefix, so any curator polish on real fields is preserved. Without
// this pass, the only way to refresh a stale entry was to delete it from
// labs.json and let discover re-propose it (losing manual overrides).
//
// The `refreshables` map is populated by discover.mjs with fresh upstream
// metadata for every entry whose id is already in the catalog.
const isTodoPlaceholder = (v) => typeof v === "string" && /^TODO:\s/i.test(v);
const refreshSource = discovered.refreshables ?? {};
const refreshes = [];
for (const e of labs.integrations) {
  const r = refreshSource[e.id];
  if (!r) continue;
  const changed = [];
  if (isTodoPlaceholder(e.tagline) && r.tagline && !isTodoPlaceholder(r.tagline)) {
    e.tagline = r.tagline;
    changed.push("tagline");
  }
  if (isTodoPlaceholder(e.description) && r.description && !isTodoPlaceholder(r.description)) {
    e.description = r.description;
    changed.push("description");
  }
  if (changed.length > 0) refreshes.push({ id: e.id, fields: changed });
}

if (added.length > 0 || featuredFlips.length > 0 || refreshes.length > 0) {
  fs.writeFileSync(labsPath, `${JSON.stringify(labs, null, 2)}\n`);
  if (added.length > 0) {
    console.log(`✔ Appended ${added.length} entries to labs.json:`);
    for (const id of added) console.log(`    + ${id}`);
  }
  if (featuredFlips.length > 0) {
    console.log(
      `${added.length > 0 ? "\n" : "✔ "}Reconciled featured flag on ${featuredFlips.length} entries (tracker label is source of truth):`,
    );
    for (const f of featuredFlips) {
      console.log(`    ${f.id}: featured ${f.from} → ${f.to}`);
    }
  }
  if (refreshes.length > 0) {
    console.log(
      `${added.length > 0 || featuredFlips.length > 0 ? "\n" : "✔ "}Refreshed TODO placeholders on ${refreshes.length} entries from upstream:`,
    );
    for (const r of refreshes) console.log(`    ${r.id}: ${r.fields.join(", ")}`);
  }
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

if (
  added.length === 0 &&
  stale.length === 0 &&
  featuredFlips.length === 0 &&
  refreshes.length === 0
) {
  console.log("\nNothing to do.");
} else {
  console.log(
    "\nNext: review git diff of src/data/labs.json, polish TODO entries, npm run validate.",
  );
}
