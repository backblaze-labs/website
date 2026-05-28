/**
 * Shared JSON-write formatting for scripts that emit committed data files.
 *
 * Why this module exists: every script that mutates a committed JSON file
 * (`labs.json`, `github-stats.json`, `links.json`, `previews.json`) used to
 * write via `JSON.stringify(data, null, 2)`. That always expands arrays to
 * multi-line, but biome's formatter (lineWidth: 100) inlines short arrays —
 * so the written file would fail CI's `npm run format:check`. It broke the
 * weekly discovery PR; it could break any of the sync workflows the next
 * time an entry's array got short enough to be inlinable.
 *
 * The fix is to route the output through biome's stdin formatter so it
 * matches what `biome format --write` would produce. Centralized here so the
 * four callers (and any future ones) stay in lockstep.
 *
 * @module scripts/_format
 */
import { execFileSync } from "node:child_process";

/**
 * Serialize `data` as biome-formatted JSON suitable for writing to `filePath`.
 *
 * Returned string is the exact bytes biome would emit if you wrote the naive
 * `JSON.stringify(data, null, 2)` output to disk and then ran
 * `biome format --write`. Callers that compare prev/next bytes to skip
 * unchanged writes (`sync-stats`, `sync-links`, `sync-previews`) keep that
 * guarantee: a biome-clean file on disk equals a fresh `formatJson` of the
 * same data.
 *
 * The scoped package name is required — `npx biome` resolves to a different,
 * unrelated package on the registry. Subprocess startup is ~100ms; fine for
 * one-shot scripts, not suitable inside a loop.
 *
 * @param {unknown} data - Value to serialize.
 * @param {string} filePath - Destination path; biome uses the extension to
 *   pick the right parser (we always pass `.json`).
 * @returns {string} biome-formatted JSON, trailing newline included.
 */
export function formatJson(data, filePath) {
  const raw = `${JSON.stringify(data, null, 2)}\n`;
  return execFileSync(
    "npx",
    ["@biomejs/biome", "format", `--stdin-file-path=${filePath}`],
    { input: raw, encoding: "utf8" },
  );
}
