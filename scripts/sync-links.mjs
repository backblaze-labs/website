#!/usr/bin/env node
/**
 * Auto-discovers `site` / `docs` / `demo` URLs for every integration and writes
 * them to src/data/links.json. The catalog (`labs.json`) carries its own
 * `site`/`docs`/`demo` fields when curators want to override; `links.json`
 * stays as a parallel auto-discovered companion file. The website does not
 * currently render these links in the card UI — they're maintained as
 * structured data for the feed/sitemap and future surfaces (e.g. detail pages).
 *
 * Heuristics:
 *
 *   First-party (has `repo`):
 *     - `site` ← repo's GitHub `homepage` field, when set and not pointing
 *       back to GitHub itself, and not a corporate marketing page.
 *     - `docs` ← `homepage` if it looks like docs (readthedocs, /docs, docs.*),
 *       otherwise unset.
 *
 *   Upstream (no `repo`):
 *     - `site` ← apex of the destination URL (e.g. docs.cvat.ai → cvat.ai/).
 *     - `docs` ← the destination URL's origin root if hostname starts with
 *       `docs.`, otherwise the destination URL itself.
 *     - `repo` ← scanned from the destination page's HTML if a single,
 *       confident `github.com/<owner>/<name>` link is present.
 *
 * Diff-aware writes — the file is only rewritten when at least one URL changes.
 *
 * Run: npm run sync-links
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { fetchHtml } from "./_http.mjs";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dataPath = path.join(root, "src/data/labs.json");
const outPath = path.join(root, "src/data/links.json");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

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

const NOISE_SITE_HOSTS = /^(www\.)?(blze\.ai|backblaze\.com|backblazeb2\.com)$/i;

function isNoiseSite(u) {
  if (!u) return false;
  try {
    return NOISE_SITE_HOSTS.test(new URL(u).host);
  } catch {
    return false;
  }
}

function isDocsy(u) {
  if (!u) return false;
  try {
    const x = new URL(u);
    if (/^docs?\./i.test(x.host)) return true;
    if (/(^|\/)docs?(\/|$)/i.test(x.pathname)) return true;
    if (/readthedocs\.io$/i.test(x.host)) return true;
    if (/\.gitbook\.io$/i.test(x.host)) return true;
    return false;
  } catch {
    return false;
  }
}

function apexHost(host) {
  return host.replace(/^(docs|www|api|developer|developers|blog)\./i, "");
}

// sync-links scrapes upstream destination pages for a github.com/<owner>/<name>
// link in the `<head>` (canonical, og:url, etc.). Stream up to 256 KB and stop
// at `</head>` — meta tags + nav links are always in the head, not the body.
async function fetchPageHtml(targetUrl) {
  return fetchHtml(targetUrl, { maxBytes: 256 * 1024, stopAtHeadEnd: true });
}

function inferRepoFromHtml(html, projectHint = "") {
  if (!html) return null;
  const counts = new Map();
  for (const m of html.matchAll(
    /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?=[\s"'<>?#)]|$)/gi,
  )) {
    const owner = m[1];
    const name = m[2];
    if (!owner || !name) continue;
    if (
      /^(orgs|sponsors|topics|features|marketplace|enterprise|pricing|about|notifications|settings)$/i.test(
        owner,
      )
    )
      continue;
    if (/^\.git$|\.git$/.test(name)) continue;
    const slug = `${owner}/${name.replace(/\.git$/, "")}`;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (projectHint) {
    const hint = projectHint.toLowerCase().replace(/[^a-z0-9]/g, "");
    const match = sorted.find(([k]) =>
      k
        .toLowerCase()
        .split("/")
        .pop()
        .replace(/[^a-z0-9]/g, "")
        .includes(hint),
    );
    if (match) return match[0];
  }
  return sorted[0][1] >= 3 ? sorted[0][0] : null;
}

async function processOne(i) {
  const links = {};
  if (i.repo) {
    try {
      const meta = await ghJSON(["api", `repos/${i.repo}`, "--jq", "{homepage, html_url}"]);
      const home = (meta.homepage || "").trim();
      if (home && !/^https?:\/\/github\.com\//i.test(home) && !isNoiseSite(home)) {
        if (isDocsy(home)) links.docs = home;
        else links.site = home;
      }
      const summary = Object.keys(links).length
        ? Object.entries(links)
            .map(([k, v]) => `${k}=${new URL(v).host}`)
            .join(", ")
        : "—";
      return { id: i.id, status: "ok", links, line: `  ${i.repo} ... ${summary}` };
    } catch (err) {
      return {
        id: i.id,
        status: "failed",
        links: {},
        line: `  ${i.repo} ... failed (${err.message.split("\n")[0]})`,
      };
    }
  }
  if (!i.url) return { id: i.id, status: "skip", links: {}, line: null };
  try {
    const u = new URL(i.url);
    const apex = apexHost(u.host);
    links.site = `${u.protocol}//${apex}/`;
    if (/^docs?\./i.test(u.host)) {
      links.docs = `${u.protocol}//${u.host}/`;
    } else if (isDocsy(i.url)) {
      links.docs = i.url;
    }
    const html = await fetchPageHtml(i.url);
    const inferred = inferRepoFromHtml(html, i.source || i.title || i.id);
    if (inferred) links.repo = inferred;
    const summary = Object.entries(links)
      .map(([k, v]) => `${k}=${k === "repo" ? v : new URL(v).host}`)
      .join(", ");
    return { id: i.id, status: "ok", links, line: `  ${i.id} (upstream) ... ${summary || "—"}` };
  } catch (err) {
    return {
      id: i.id,
      status: "failed",
      links: {},
      line: `  ${i.id} (upstream) ... failed (${err.message.split("\n")[0]})`,
    };
  }
}

const results = await Promise.all(data.integrations.map(processOne));
const orderById = new Map(data.integrations.map((i, idx) => [i.id, idx]));
results.sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));
for (const r of results) if (r.line) console.log(r.line);

const out = {};
let ok = 0;
let fail = 0;
for (const r of results) {
  if (r.status === "ok") ok++;
  else if (r.status === "failed") fail++;
  if (Object.keys(r.links).length > 0) out[r.id] = r.links;
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
    `\n✔ Wrote ${path.relative(root, outPath)} — ${ok} ok, ${fail} failed, ${Object.keys(sorted).length} entries.`,
  );
} else {
  console.log(`\n✔ No changes — ${ok} ok, ${fail} failed. (file untouched)`);
}
if (fail > 0) process.exitCode = 1;
