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
 * Auth: uses the `gh` CLI. CI: GH_TOKEN / GITHUB_TOKEN.
 *
 * Run:  npm run sync-stats
 */
import { spawn } from "node:child_process";
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

// Async wrapper around `gh` so calls can run in parallel via Promise.all.
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

async function processOne(i) {
  if (!i.repo) {
    return { id: i.id, status: "upstream", line: `  ${i.id} ... skipped (upstream integration)` };
  }
  try {
    const r = await ghJSON([
      "api",
      `repos/${i.repo}`,
      "--jq",
      "{stars: .stargazers_count, forks: .forks_count, lang: .language, updated: .pushed_at, license: .license.spdx_id, archived: .archived, openIssues: .open_issues_count, description: .description}",
    ]);
    const prev = existing[i.id];
    if (prev && isUnchanged(prev, r)) {
      return {
        id: i.id,
        status: "unchanged",
        entry: prev,
        line: `  ${i.repo} ... ★ ${r.stars}, no change`,
      };
    }
    return {
      id: i.id,
      status: "changed",
      entry: { ...r, repo: i.repo, fetchedAt: new Date().toISOString() },
      line: `  ${i.repo} ... ★ ${r.stars}, updated ${r.updated.slice(0, 10)}  (changed)`,
    };
  } catch (err) {
    return {
      id: i.id,
      status: "failed",
      entry: existing[i.id],
      line: `  ${i.repo} ... failed (${err.message.split("\n")[0]})`,
    };
  }
}

const results = await Promise.all(data.integrations.map(processOne));

// Print in catalog order regardless of completion order.
const orderById = new Map(data.integrations.map((i, idx) => [i.id, idx]));
results.sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));
for (const r of results) console.log(r.line);

const out = {};
let ok = 0;
let fail = 0;
let bumped = 0;
let unchanged = 0;
for (const r of results) {
  if (r.status === "upstream") continue;
  if (r.status === "failed") {
    fail++;
    if (r.entry) out[r.id] = r.entry;
    continue;
  }
  ok++;
  if (r.status === "changed") bumped++;
  else if (r.status === "unchanged") unchanged++;
  if (r.entry) out[r.id] = r.entry;
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

if (nextJson !== prevJson) {
  fs.writeFileSync(outPath, nextJson);
  console.log(
    `\n✔ Wrote ${path.relative(root, outPath)} — ${ok} ok, ${fail} failed, ${bumped} changed, ${unchanged} unchanged.`,
  );
} else {
  console.log(
    `\n✔ No changes — ${ok} ok, ${fail} failed, ${unchanged} unchanged. (file untouched)`,
  );
}
if (fail > 0) process.exitCode = 1;
