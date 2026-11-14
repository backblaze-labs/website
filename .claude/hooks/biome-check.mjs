#!/usr/bin/env node
/* global process */
// PostToolUse backstop: after an edit, check Biome on the file and hand any
// issue back to Claude (exit 2). CI and CODEOWNERS remain the real gates; this
// is a fast local nudge, skipped when Biome is unavailable.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

let file;
try {
  file = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.file_path || "";
} catch {
  process.exit(0);
}
if (!/\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc)$/.test(file)) process.exit(0);

const res = spawnSync("npx", ["@biomejs/biome", "check", file], { encoding: "utf8" });
if (res.error || res.status === 0) process.exit(0); // Biome missing, or file is clean.

process.stderr.write(
  `Biome found issues in ${file}. Run \`npm run format\` and \`npm run lint:fix\`.\n${res.stdout || ""}${res.stderr || ""}`,
);
process.exit(2);
