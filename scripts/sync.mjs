#!/usr/bin/env node
/**
 * Runs every catalog-sync script in parallel and exits non-zero if any of
 * them fail. Replaces an earlier `node -e "...spawn..." && wait` one-liner
 * in package.json that worked by accident — this version is readable and
 * surfaces the per-script exit code clearly.
 *
 * The three scripts touch independent files, so order doesn't matter:
 *   - sync-stats.mjs    → src/data/github-stats.json
 *   - sync-links.mjs    → src/data/links.json
 *   - sync-previews.mjs → src/data/previews.json
 *
 * Run: npm run sync
 */
import { spawn } from "node:child_process";

const STEPS = ["sync-stats", "sync-links", "sync-previews"];

const results = await Promise.all(
  STEPS.map(
    (step) =>
      new Promise((resolve) => {
        const proc = spawn("npm", ["run", step], { stdio: "inherit" });
        proc.on("close", (code) => resolve({ step, code: code ?? 1 }));
        proc.on("error", () => resolve({ step, code: 1 }));
      }),
  ),
);

const failed = results.filter((r) => r.code !== 0);
if (failed.length > 0) {
  console.error(
    `\n✘ ${failed.length} sync step(s) failed: ${failed.map((f) => `${f.step} (${f.code})`).join(", ")}`,
  );
  process.exit(1);
}
