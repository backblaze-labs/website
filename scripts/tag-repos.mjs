#!/usr/bin/env node
/**
 * Bootstrap: adds the `b2-labs` topic to every public, non-archived repo in
 * `backblaze-labs` and `backblaze-b2-samples` (skipping the website + tracker
 * repos themselves).
 *
 * Idempotent — if a repo already has the topic, it's left alone. Existing
 * topics are preserved.
 *
 * Run modes:
 *   dry-run (default) — prints the plan, mutates nothing.
 *   --apply           — actually adds the topic via the GitHub API.
 *
 * After running this once, every existing integration in the two orgs becomes
 * a discovery candidate. Subsequent additions just need the `b2-labs` topic
 * set when the repo is created.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const ORGS = ["backblaze-labs", "backblaze-b2-samples"];
const SKIP = new Set(["backblaze-labs/website", "backblaze-labs/demand-side-ai"]);
const TOPIC = "b2-labs";

const apply = process.argv.includes("--apply");

function gh(args) {
  const r = spawnSync("gh", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`gh ${args.join(" ")} → ${r.stderr.trim()}`);
  return r.stdout;
}
const ghJSON = (args) => JSON.parse(gh(args));

function listOrg(org) {
  return ghJSON([
    "repo",
    "list",
    org,
    "--limit",
    "200",
    "--json",
    "nameWithOwner,repositoryTopics,isArchived,visibility",
  ])
    .filter((r) => r.visibility === "PUBLIC" && !r.isArchived)
    .filter((r) => !SKIP.has(r.nameWithOwner))
    .map((r) => ({
      repo: r.nameWithOwner,
      topics: (r.repositoryTopics ?? []).map((t) => (typeof t === "string" ? t : t.name)),
    }));
}

const all = [];
for (const org of ORGS) {
  const found = listOrg(org);
  console.log(`  ${org}: ${found.length} candidates`);
  all.push(...found);
}

const toTag = all.filter((r) => !r.topics.map((t) => t.toLowerCase()).includes(TOPIC));
const alreadyTagged = all.filter((r) => r.topics.map((t) => t.toLowerCase()).includes(TOPIC));

console.log(`\nAlready tagged: ${alreadyTagged.length}`);
console.log(`To tag: ${toTag.length}`);
for (const r of toTag) console.log(`  + ${r.repo}`);

if (!apply) {
  console.log("\nDry-run only. Re-run with --apply to actually add the topic.");
  process.exit(0);
}

console.log("\nApplying ...");
let ok = 0;
let fail = 0;
for (const r of toTag) {
  const next = [...new Set([...r.topics.map((t) => t.toLowerCase()), TOPIC])];
  const args = [
    "api",
    "-X",
    "PUT",
    `repos/${r.repo}/topics`,
    "-H",
    "Accept: application/vnd.github+json",
  ];
  for (const t of next) args.push("-f", `names[]=${t}`);
  process.stdout.write(`  ${r.repo} ... `);
  try {
    gh(args);
    ok++;
    process.stdout.write("ok\n");
  } catch (e) {
    fail++;
    process.stdout.write(`FAILED (${e.message.split("\n")[0]})\n`);
  }
}
console.log(`\n✔ Tagged ${ok}, failed ${fail}.`);
