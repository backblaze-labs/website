#!/usr/bin/env node
/**
 * Fetches GitHub repo metadata for every integration in labs.json and merges
 * it into src/data/github-stats.json. The site reads this file at build time.
 *
 * Diff-aware: an entry's `fetchedAt` is only bumped when at least one of the
 * meaningful fields (stars, forks, lang, updated, license, archived,
 * openIssues, description) actually changed. New repos always get a fresh
 * entry. Removed repos drop out of the file.
 *
 * If nothing changed, the file is rewritten byte-identical to before — so the
 * refresh-stats workflow's `git status --porcelain` check sees a clean tree
 * and no commit is created.
 *
 * Auth: uses the `gh` CLI (already authenticated for maintainers). On CI, set
 *   GH_TOKEN / GITHUB_TOKEN — `gh` picks them up automatically.
 *
 * Run:  npm run sync-stats
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dataPath = path.join(root, "src/data/labs.json");
const outPath = path.join(root, "src/data/github-stats.json");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const existing = (() => {
  try {
    return JSON.parse(fs.readFileSync(outPath, "utf8"));
  } catch {
    return {};
  }
})();

function ghJSON(args) {
  const r = spawnSync("gh", args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`gh ${args.join(" ")} → ${r.stderr.trim() || "non-zero exit"}`);
  }
  return JSON.parse(r.stdout);
}

// Fields whose changes warrant bumping `fetchedAt`. Order matters for stable
// JSON output — keep alphabetised.
const TRACKED_FIELDS = [
  "archived",
  "description",
  "forks",
  "lang",
  "license",
  "openIssues",
  "stars",
  "updated",
];

function meaningfulSubset(entry) {
  if (!entry) return null;
  const out = {};
  for (const k of TRACKED_FIELDS) out[k] = entry[k] ?? null;
  return out;
}

function isUnchanged(prev, next) {
  const a = meaningfulSubset(prev);
  const b = meaningfulSubset(next);
  if (!a) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

const out = {};
let ok = 0;
let fail = 0;
let bumped = 0;
let unchanged = 0;

for (const i of data.integrations) {
  // Upstream integrations don't have a backblaze-labs repo — skip.
  if (!i.repo) {
    process.stdout.write(`  ${i.id} ... skipped (upstream integration)\n`);
    continue;
  }
  process.stdout.write(`  ${i.repo} ... `);
  try {
    const r = ghJSON([
      "api",
      `repos/${i.repo}`,
      "--jq",
      "{stars: .stargazers_count, forks: .forks_count, lang: .language, updated: .pushed_at, license: .license.spdx_id, archived: .archived, openIssues: .open_issues_count, description: .description}",
    ]);
    const prev = existing[i.id];
    if (prev && isUnchanged(prev, r)) {
      // Nothing changed — preserve the existing record verbatim, including its
      // old `fetchedAt`. This is what stops the file churning on every run.
      out[i.id] = prev;
      unchanged++;
      process.stdout.write(`★ ${r.stars}, no change\n`);
    } else {
      out[i.id] = { ...r, repo: i.repo, fetchedAt: new Date().toISOString() };
      bumped++;
      process.stdout.write(`★ ${r.stars}, updated ${r.updated.slice(0, 10)}  (changed)\n`);
    }
    ok++;
  } catch (err) {
    process.stdout.write(`failed (${err.message.split("\n")[0]})\n`);
    fail++;
    // On API failure, preserve the existing entry rather than dropping it.
    if (existing[i.id]) out[i.id] = existing[i.id];
  }
}

// Stable, sorted-by-key serialization. Keeps diffs minimal even if the order
// of entries in labs.json changes.
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

if (nextJson !== prevJson) {
  fs.writeFileSync(outPath, nextJson);
  console.log(`\n✔ Wrote ${path.relative(root, outPath)} — ${ok} ok, ${fail} failed, ${bumped} changed, ${unchanged} unchanged.`);
} else {
  console.log(`\n✔ No changes — ${ok} ok, ${fail} failed, ${unchanged} unchanged. (file untouched)`);
}

if (fail > 0) process.exitCode = 1;
