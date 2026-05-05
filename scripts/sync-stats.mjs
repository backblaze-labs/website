#!/usr/bin/env node
/**
 * Fetches GitHub repo metadata for every integration in labs.json and writes it
 * to src/data/github-stats.json. The site reads this file at build time.
 *
 * Auth: uses the `gh` CLI (already authenticated for maintainers). On CI, set
 *   GH_TOKEN / GITHUB_TOKEN — `gh` picks them up automatically.
 *
 * Run:  npm run sync-stats
 *
 * The output is committed. Builds work offline; they don't hit the API.
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

function ghJSON(args) {
  const r = spawnSync("gh", args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`gh ${args.join(" ")} → ${r.stderr.trim() || "non-zero exit"}`);
  }
  return JSON.parse(r.stdout);
}

const out = {};
let ok = 0;
let fail = 0;

for (const i of data.integrations) {
  // Upstream integrations don't have a backblaze-labs repo — they live in someone
  // else's project (e.g. MLflow). No GitHub stats to fetch.
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
    out[i.id] = { ...r, repo: i.repo, fetchedAt: new Date().toISOString() };
    process.stdout.write(`★ ${r.stars}, updated ${r.updated.slice(0, 10)}\n`);
    ok++;
  } catch (err) {
    process.stdout.write(`failed (${err.message.split("\n")[0]})\n`);
    fail++;
  }
}

fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\n✔ Wrote ${outPath} — ${ok} ok, ${fail} failed.`);
if (fail > 0) process.exitCode = 1;
