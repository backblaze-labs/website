#!/usr/bin/env node
/* global process, console */
// Fails a PR that changes source without adding a `.changes/unreleased/*.yaml`
// changie fragment. Bypass with the `skip-changelog` label (handled in the
// workflow `if:`). Generated data under `src/data/*.json` does not require one.
import { execSync } from "node:child_process";

const base = process.env.BASE_REF || "main";
let changed = [];
try {
  execSync(`git fetch origin ${base} --depth=1`, { stdio: "ignore" });
  changed = execSync(`git diff --name-only origin/${base}...HEAD`, { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
} catch {
  console.log("Could not diff against base; skipping changelog check.");
  process.exit(0);
}

const addedFragment = changed.some((f) => /^\.changes\/unreleased\/.+\.ya?ml$/.test(f));
const sourceChanged = changed.some(
  (f) => /^(src|scripts|public|\.github\/workflows)\//.test(f) && !/^src\/data\/.*\.json$/.test(f),
);

if (!sourceChanged) {
  console.log("No source change requiring a changelog fragment.");
  process.exit(0);
}
if (addedFragment) {
  console.log("Changelog fragment present.");
  process.exit(0);
}
console.error(
  "Add a changelog fragment with `npm run changelog`, or label the PR `skip-changelog`.",
);
process.exit(1);
