#!/usr/bin/env node
/**
 * Seeds tier-1 tracker sub-issues from an internal CSV.
 *
 * Reads the master CSV (path passed as --csv), computes the diff against the
 * existing sub-issues of the configured tracker, and creates a new tracker
 * sub-issue for each missing tool with a public-facing body + a pre-populated
 * YAML meta block at the end (so when the integration ships, closing the
 * issue produces a clean catalog entry on the next discovery run).
 *
 * Internal-only columns (B2 Storage Relevance, Status, Assigned, Marketing)
 * are NEVER included in the public issue body.
 *
 * Run modes:
 *   dry-run (default)  — prints the plan, creates nothing.
 *   --apply            — actually creates issues and adds them as sub-issues.
 *
 * Required: gh CLI authenticated with write access to the tracker repo.
 *
 * Usage:
 *   node scripts/seed-tracker.mjs --csv "<path>" [--apply] [--limit N]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const TRACKER = { repo: "backblaze-labs/demand-side-ai", number: 5 };
const ISSUE_LABELS = ["B2 Integration"];

// === Args ===

const args = process.argv.slice(2);
function getArg(name, def = null) {
  const idx = args.indexOf(name);
  if (idx === -1) return def;
  return args[idx + 1];
}
const apply = args.includes("--apply");
const limit = Number.parseInt(getArg("--limit", "0"), 10) || 0;
const csvPath = getArg("--csv");
if (!csvPath || !fs.existsSync(csvPath)) {
  console.error(`Usage: node scripts/seed-tracker.mjs --csv <path> [--apply] [--limit N]`);
  process.exit(2);
}

// === gh CLI ===

function gh(cmdArgs, opts = {}) {
  const r = spawnSync("gh", cmdArgs, { encoding: "utf8", ...opts });
  if (r.status !== 0) {
    throw new Error(`gh ${cmdArgs.join(" ")} failed: ${r.stderr.trim()}`);
  }
  return r.stdout;
}
const ghJSON = (cmdArgs) => JSON.parse(gh(cmdArgs));

// === Tiny CSV parser (handles quoted fields with embedded commas/newlines) ===

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c === "\r") {
      // ignore
    } else {
      cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

// === CSV → tools ===

// Section header detection: rows whose first cell looks like "N. <Section Title>"
// and whose other cells are mostly empty are treated as category dividers.
const SECTION_HEADER_RE = /^\s*\d+\.\s+\S/;

// Map section title fragment → catalog categories.
const SECTION_TO_CATEGORIES = [
  [/data ingestion/i, ["data-pipelines"]],
  [/orchestration|pipeline management/i, ["data-pipelines"]],
  [/cataloging/i, ["data-pipelines"]],
  [/cleaning|transformation/i, ["data-pipelines"]],
  [/labeling|annotation/i, ["ai-ml", "data-pipelines"]],
  [/synthetic data/i, ["ai-ml"]],
  [/versioning/i, ["data-pipelines"]],
  [/feature engineering|feature stores?/i, ["ai-ml"]],
  [/vector|semantic|index/i, ["ai-ml"]],
  [/experiment tracking|reproducibility/i, ["ai-ml"]],
  [/training|fine[\s-]?tuning|frameworks?/i, ["ai-ml"]],
  [/evaluation|benchmarking/i, ["ai-ml"]],
  [/serving|inference/i, ["ai-ml", "infra"]],
  [/agent|llm|llmops/i, ["ai-ml", "agent-skills"]],
  [/observability|monitoring/i, ["infra"]],
  [/notebook/i, ["notebooks"]],
  [/visualization|dashboard/i, ["data-pipelines"]],
];

function categoriesForSection(section) {
  for (const [re, cats] of SECTION_TO_CATEGORIES) {
    if (re.test(section)) return cats;
  }
  return ["ai-ml"];
}

function parseLanguages(s) {
  return (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.toLowerCase() !== "unknown");
}

function primaryLanguage(s) {
  const langs = parseLanguages(s);
  if (langs.length === 0) return "python";
  // Prefer Python if mentioned (most B2 integrations are python-driven).
  if (langs.find((l) => /^python$/i.test(l))) return "python";
  const first = langs[0].toLowerCase();
  if (/^typescript$/i.test(first)) return "typescript";
  if (/^javascript$/i.test(first)) return "javascript";
  if (/^go$/i.test(first)) return "go";
  return "python";
}

function tagsForTool(name, languages) {
  const slug = name
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const langs = parseLanguages(languages).map((l) => l.toLowerCase());
  return [slug, ...langs.slice(0, 3), "s3-compatible"]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 6);
}

function toolsFromCsv(rows) {
  const header = rows[0];
  const idx = (name) => header.indexOf(name);
  const iName = idx("Framework / Tool");
  const iDesc = idx("Description");
  const iLicense = idx("License");
  const iRepo = idx("GitHub Repository");
  const iLang = idx("Languages");

  const tools = [];
  let section = "Uncategorised";

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = (row[iName] ?? "").trim();
    if (!name) continue;

    // Section header rows: "N. Title" with mostly-empty other columns.
    if (SECTION_HEADER_RE.test(name) && (row[iDesc] ?? "").trim() === "") {
      section = name.replace(/^\s*\d+\.\s+/, "").trim();
      continue;
    }

    // Skip URL-only rows (e.g. links to PRs / repos as standalone notes).
    if (/^https?:\/\//.test(name)) continue;

    // Skip rows with no description AND no repo — usually orphan annotations.
    const desc = (row[iDesc] ?? "").trim();
    const repo = (row[iRepo] ?? "").trim();
    if (!desc && !repo) continue;

    tools.push({
      name,
      section,
      description: desc,
      license: (row[iLicense] ?? "").trim(),
      repo,
      languages: (row[iLang] ?? "").trim(),
    });
  }
  return tools;
}

// === Existing sub-issues ===

function listExistingSubIssues() {
  const out = ghJSON([
    "api",
    `repos/${TRACKER.repo}/issues/${TRACKER.number}/sub_issues`,
    "--paginate",
  ]);
  return out.map((s) => ({
    number: s.number,
    title: s.title,
    state: s.state,
    nodeId: s.node_id,
  }));
}

// Loose match: if the existing title contains the tool name (case-insensitive),
// treat it as already tracked. Handles variants like "Zenml Integration",
// "Mage-ai Integration", etc.
function isAlreadyTracked(toolName, existing) {
  const normTool = toolName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const e of existing) {
    const normExisting = e.title.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (
      normExisting.includes(normTool) ||
      normTool.includes(normExisting.replace(/integration|tool|support/g, ""))
    ) {
      return e;
    }
  }
  return null;
}

// === Issue body composer (PUBLIC-FACING ONLY) ===

function composeIssueBody(tool, categories, language) {
  const lines = [];
  lines.push(`**Project:** ${tool.repo ? `[${tool.name}](${tool.repo})` : tool.name}`);
  if (tool.section) lines.push(`**Category:** ${tool.section}`);
  if (tool.license) lines.push(`**License:** ${tool.license}`);
  if (tool.languages) lines.push(`**Languages:** ${tool.languages}`);
  lines.push("");
  if (tool.description) {
    lines.push(tool.description);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("When this integration ships, fill in the YAML block below and close this issue.");
  lines.push("The Backblaze Labs website will pick it up automatically on the next discovery run.");
  lines.push(
    "See [CONVENTIONS.md](https://github.com/backblaze-labs/website/blob/main/CONVENTIONS.md).",
  );
  lines.push("");
  lines.push("```yaml");
  lines.push("# backblaze-integration");
  lines.push("url: # docs URL where users see the B2 instructions");
  lines.push(`source: ${tool.name}`);
  lines.push(`categories: ${categories.join(", ")}`);
  lines.push(`language: ${language}`);
  lines.push("tagline: # one-line pitch (<= 80 chars)");
  lines.push("description: # 2-3 sentence public-facing description");
  lines.push(`tags: ${tagsForTool(tool.name, tool.languages).join(", ")}`);
  lines.push("icon: flow");
  lines.push("```");
  return lines.join("\n");
}

function composeTitle(tool) {
  return `${tool.name} Integration`;
}

// === Plan + execute ===

const csvText = fs.readFileSync(path.resolve(csvPath), "utf8");
const rows = parseCsv(csvText);
const tools = toolsFromCsv(rows);
console.log(`Parsed ${tools.length} candidate tools from CSV.`);

console.log(`Listing existing sub-issues of ${TRACKER.repo}#${TRACKER.number} ...`);
const existing = listExistingSubIssues();
console.log(`  ${existing.length} already tracked (open + closed).`);

const plan = [];
for (const tool of tools) {
  const match = isAlreadyTracked(tool.name, existing);
  if (match) continue;
  const cats = categoriesForSection(tool.section);
  const lang = primaryLanguage(tool.languages);
  plan.push({
    tool,
    title: composeTitle(tool),
    body: composeIssueBody(tool, cats, lang),
    cats,
    lang,
  });
}

const slice = limit > 0 ? plan.slice(0, limit) : plan;

console.log(
  `\nPlan: create ${slice.length} new sub-issues${limit > 0 ? ` (limited to ${limit})` : ""}.`,
);
for (const p of slice) {
  console.log(`  + ${p.title}  [${p.cats.join(", ")}]  (${p.tool.section})`);
}

if (!apply) {
  console.log("\nDry-run only. Re-run with --apply to actually create these issues.");
  process.exit(0);
}

// === Apply ===

console.log("\nCreating issues + adding as sub-issues ...");
const created = [];
for (const p of slice) {
  process.stdout.write(`  ${p.title} ... `);
  try {
    // 1. Create the issue.
    const createOut = gh([
      "issue",
      "create",
      "--repo",
      TRACKER.repo,
      "--title",
      p.title,
      "--body",
      p.body,
      ...ISSUE_LABELS.flatMap((l) => ["--label", l]),
    ]);
    // gh prints the URL on stdout; extract the issue number.
    const m = createOut.trim().match(/\/issues\/(\d+)/);
    if (!m) throw new Error(`couldn't parse issue url from: ${createOut.trim()}`);
    const num = Number.parseInt(m[1], 10);

    // 2. Resolve its node ID and attach as sub-issue of TRACKER.
    const node = ghJSON(["api", `repos/${TRACKER.repo}/issues/${num}`, "--jq", "{id, node_id}"]);
    gh([
      "api",
      "-X",
      "POST",
      `repos/${TRACKER.repo}/issues/${TRACKER.number}/sub_issues`,
      "-f",
      `sub_issue_id=${node.id}`,
    ]);

    created.push({ number: num, title: p.title });
    process.stdout.write(`#${num}\n`);
  } catch (e) {
    process.stdout.write(`FAILED (${e.message.split("\n")[0]})\n`);
  }
}

console.log(`\n✔ Created ${created.length}/${slice.length} sub-issues.`);
for (const c of created) console.log(`  https://github.com/${TRACKER.repo}/issues/${c.number}`);
