#!/usr/bin/env node
/**
 * Discovers candidate integrations from three sources:
 *   1. Public, non-archived repos in `backblaze-labs` carrying the `b2-labs` topic
 *   2. Public, non-archived repos in `backblaze-b2-samples` carrying the `b2-labs` topic
 *   3. Closed sub-issues / `[x]` task-list items in tier-1 tracker issues
 *      (currently just backblaze-labs/demand-side-ai#5)
 *
 * Tracker sub-issue labels control where the implementation lives:
 *   B2 Documentation  → upstream entry (someone else's docs)
 *   B2 Tool/Plugin    → matching repo in backblaze-labs/* (handled by source 1)
 *   B2 Example        → matching repo in backblaze-b2-samples/* (handled by source 2)
 *
 * Each candidate is drafted with a `_complete` flag indicating whether every
 * field came from explicit upstream metadata. Both complete and incomplete
 * entries are merged by `merge-discovered`; the weekly PR surfaces TODOs so
 * the maintainer can either polish them or fix the upstream first.
 *
 * Outputs src/data/labs.discovered.json — consumed by `merge-discovered.mjs`.
 *
 * Conventions: see ../CONVENTIONS.md for the full contract.
 *
 * Auth: uses the `gh` CLI. CI: set GH_TOKEN / GITHUB_TOKEN.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { decodeHtmlEntities, fetchHtml } from "./_http.mjs";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const labsPath = path.join(root, "src/data/labs.json");
const discoveredPath = path.join(root, "src/data/labs.discovered.json");

const ORGS = ["backblaze-labs", "backblaze-b2-samples"];
// Tier-1 tracker issues — issues that list upstream projects with shipped B2
// integrations. Add more entries as new tier-1 trackers are created. Each is
// processed identically; closed sub-issues / `[x]` items become catalog cards.
const TRACKERS = [{ repo: "backblaze-labs/demand-side-ai", number: 5 }];
const SKIP_REPOS = new Set(["backblaze-labs/website", "backblaze-labs/demand-side-ai"]);

// Single opt-in topic. A repo is included in the catalog if and only if it has
// this topic set on GitHub. Everything else is inferred from description, primary
// language, and other topics.
const INCLUDE_TOPIC = "b2-labs";

// === Topic vocabulary ===

// Inferred categories from common open-source topics.
const TOPIC_TO_CATEGORY = {
  "ai-pipeline": "ai-ml",
  "ai-pipelines": "ai-ml",
  "machine-learning": "ai-ml",
  ml: "ai-ml",
  mlops: "ai-ml",
  "ai-infrastructure": "ai-ml",
  "generative-ai": "ai-ml",
  ai: "ai-ml",
  "image-generation": "ai-ml",
  "video-generation": "ai-ml",
  "audio-generation": "ai-ml",
  "data-pipeline": "data-pipelines",
  "data-pipelines": "data-pipelines",
  etl: "data-pipelines",
  jupyter: "notebooks",
  jupyterlab: "notebooks",
  ipython: "notebooks",
  notebook: "notebooks",
  vscode: "ide-extensions",
  "vscode-extension": "ide-extensions",
  intellij: "ide-extensions",
  ide: "ide-extensions",
  claude: "agent-skills",
  agent: "agent-skills",
  "agent-skill": "agent-skills",
  skill: "agent-skills",
  mcp: "agent-skills",
  infrastructure: "infra",
  infra: "infra",
  cli: "developer-tools",
  devtools: "developer-tools",
  "developer-tools": "developer-tools",
  sdk: "developer-tools",
};

const LANGUAGE_MAP = {
  Python: "python",
  TypeScript: "typescript",
  JavaScript: "javascript",
  Go: "go",
};

// === gh CLI ===

function gh(args) {
  const r = spawnSync("gh", args, { encoding: "utf8" });
  if (r.status !== 0) {
    const e = new Error(`gh ${args.join(" ")} failed: ${r.stderr.trim() || "non-zero exit"}`);
    e.stderr = r.stderr;
    throw e;
  }
  return r.stdout;
}
const ghJSON = (args) => JSON.parse(gh(args));

// === Source 1+2: org repo listings ===

// Returns ALL public, non-archived repos in the org (no topic filter applied).
// The caller separately partitions by `b2-labs` topic — we need the full list to
// distinguish "repo deleted from org" from "topic accidentally removed".
function listOrgRepos(org) {
  const out = ghJSON([
    "repo",
    "list",
    org,
    "--limit",
    "200",
    "--json",
    "name,nameWithOwner,description,repositoryTopics,primaryLanguage,isArchived,visibility",
  ]);
  return out
    .filter((r) => r.visibility === "PUBLIC" && !r.isArchived)
    .filter((r) => !SKIP_REPOS.has(r.nameWithOwner))
    .map((r) => ({
      repo: r.nameWithOwner,
      name: r.name,
      description: (r.description ?? "").trim(),
      topics: (r.repositoryTopics ?? []).map((t) => (typeof t === "string" ? t : t.name)),
      language: r.primaryLanguage?.name ?? null,
    }));
}

function hasIncludeTopic(r) {
  return r.topics.map((t) => t.toLowerCase()).includes(INCLUDE_TOPIC);
}

// === Source 3: tracker sub-issues ===

// Parses a tracker sub-issue body. The format is plain flat `key: value` lines
// with no fence and no marker — matching what the closed sub-issues under the
// tier-1 tracker (backblaze-labs/demand-side-ai#5) actually use. Example:
//
//   issue: https://github.com/meltano/meltano/issues/9988
//   pull_request: https://github.com/meltano/meltano/pull/9990
//   docs: https://docs.meltano.com/concepts/state_backends/#backblaze-b2-example
//   user_agent_extra: meltano
//
// Recognised structural keys (the rest are passed through for catalog overrides):
//   issue                  upstream issue URL — informational
//   pull_request           upstream PR URL — used as fallback destination
//   pull_request_rejected  rejected/superseded PR URL — last-resort destination
//   docs                   upstream docs URL — preferred destination
//   plugin                 backblaze-labs/* or backblaze-b2-samples/* repo URL.
//                          When present, repo discovery handles it — we skip the
//                          tracker entry to avoid duplicate cards.
//   user_agent_extra       stable identifier (e.g. "meltano", "pixeltable") —
//                          used as a slug fallback when URL host doesn't help.
//
// Catalog override keys (all optional, override auto-inference):
//   url, source, tagline, description, categories, language, tags,
//   icon, featured, id, title.
//
// Literal "null", "none", "n/a", "tbd", and empty strings are coerced to
// undefined so callers can use simple `meta.docs || meta.pull_request` chains.

// Keys we recognise as a "this body is a tracker meta block" signal. Without
// at least one of these, we fall back to URL extraction over the raw body.
const TRACKER_SENTINEL_KEYS = new Set([
  "issue",
  "pull_request",
  "pull_request_rejected",
  "docs",
  "plugin",
  "user_agent_extra",
  "url",
  "source",
  "tagline",
  "description",
  "categories",
  "language",
  "tags",
  "icon",
  "featured",
  "id",
  "title",
]);

const NULLISH_VALUES = new Set(["null", "none", "n/a", "tbd", "todo", ""]);
function cleanValue(v) {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (NULLISH_VALUES.has(s.toLowerCase())) return undefined;
  return s;
}

function parseFlatBlock(content) {
  const meta = {};
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue; // skip blanks + comments
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const k = line.slice(0, sep).trim();
    let v = line.slice(sep + 1).trim();
    // Strip surrounding quotes; tolerate YAML inline arrays like `[a, b]`.
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    } else if (v.startsWith("[") && v.endsWith("]")) {
      v = v
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .join(", ");
    }
    if (!k) continue;
    meta[k] = v;
  }
  return meta;
}

// Parse a closed sub-issue body into a normalized meta object. Returns null
// if no recognised tracker keys appear (so unrelated content doesn't get
// mistaken for metadata).
function parseTrackerBody(body) {
  if (!body) return null;
  const raw = parseFlatBlock(body);
  const meta = {};
  for (const [k, v] of Object.entries(raw)) {
    const cleaned = cleanValue(v);
    if (cleaned !== undefined) meta[k.toLowerCase()] = cleaned;
  }
  const hasSentinel = Object.keys(meta).some((k) => TRACKER_SENTINEL_KEYS.has(k));
  return hasSentinel ? meta : null;
}

// Extract the most-likely "destination" URL from free-form issue body text.
//
// We score every URL the body mentions and pick the highest. GitHub issue / PR
// URLs are explicitly disqualified — those are metadata pointers, not user
// destinations. If only github.com URLs exist, returns null so the caller can
// flag `url` as missing rather than silently sending users to a tracker issue.
function extractDestUrlFromBody(body) {
  if (!body) return null;
  const all = [...body.matchAll(/https?:\/\/[^\s)>\]"']+/g)].map((m) =>
    m[0].replace(/[.,;:]+$/, ""),
  );
  if (all.length === 0) return null;

  function score(u) {
    let host;
    let path;
    try {
      const url = new URL(u);
      host = url.host.toLowerCase();
      path = url.pathname;
    } catch {
      return -1;
    }
    // Hard exclude GitHub issues / pulls / discussions / commits. They're metadata,
    // not destinations.
    if (
      /^(www\.)?github\.com$/i.test(host) &&
      /^\/[^/]+\/[^/]+\/(issues|pull|pulls|discussions|commit|commits)\b/i.test(path)
    ) {
      return -100;
    }
    let s = 0;
    if (/^docs\./i.test(host)) s += 30; // docs.cvat.ai etc.
    if (host === "pypi.org") s += 20; // pypi.org/project/...
    if (host === "www.npmjs.com" || host === "npmjs.com") s += 20;
    if (/^(www\.)?github\.com$/i.test(host)) s -= 10; // tolerated only as last resort
    s += Math.min(path.split("/").filter(Boolean).length, 5) * 2; // depth
    return s;
  }

  const ranked = all
    .map((u) => ({ u, s: score(u) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s);
  return ranked[0]?.u ?? null;
}

// Fetch HTML metadata from a URL (title, description, og:image). Streams up
// to 256 KB and bails as soon as `</head>` is seen — meta tags are always
// near the top. Returns null on any failure.
async function fetchUrlMetadata(targetUrl) {
  const html = await fetchHtml(targetUrl, { maxBytes: 256 * 1024, stopAtHeadEnd: true });
  if (!html) return null;
  const pick = (re) => decodeHtmlEntities(html.match(re)?.[1]?.trim());
  const title = pick(/<title[^>]*>([^<]+)<\/title>/i);
  const ogTitle = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const description =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const ogImage = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  return { title: ogTitle || title || null, description: description || null, ogImage };
}

function fetchTrackerItems(tracker) {
  const ref = `${tracker.repo}#${tracker.number}`;
  const out = [];
  // Try GitHub Sub-issues API first.
  try {
    const subs = ghJSON(["api", `repos/${tracker.repo}/issues/${tracker.number}/sub_issues`]);
    for (const s of subs) {
      if (s.state !== "closed") continue;
      out.push({
        title: s.title,
        url: s.html_url,
        body: s.body ?? "",
        labels: (s.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)),
        source: `${ref} (sub-issue)`,
      });
    }
  } catch {
    /* fall through to body-tasklist parsing */
  }

  // Body-tasklist fallback — works without the Sub-issues feature.
  try {
    const issue = ghJSON([
      "issue",
      "view",
      String(tracker.number),
      "--repo",
      tracker.repo,
      "--json",
      "body",
    ]);
    const taskRe = /^[\t ]*[-*]\s+\[x\]\s+(.+)$/gim;
    for (const m of (issue.body ?? "").matchAll(taskRe)) {
      const text = m[1].trim();
      const linkMatch = text.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
      const urlMatch = text.match(/\bhttps?:\/\/\S+/);
      const title =
        linkMatch?.[1] ??
        text
          .split(/\s+(?=https?:)/)[0]
          .replace(/[#`*_]/g, "")
          .trim();
      const u = linkMatch?.[2] ?? urlMatch?.[0] ?? null;
      if (title && u) {
        out.push({ title, url: u, body: "", labels: [], source: `${ref} (tasklist)` });
      }
    }
  } catch (e) {
    console.warn(`  ! tracker ${ref} not accessible: ${e.message.split("\n")[0]}`);
    return [];
  }

  // Dedupe by URL within this tracker.
  const seen = new Set();
  return out.filter((x) => {
    if (!x.url || seen.has(x.url)) return false;
    seen.add(x.url);
    return true;
  });
}

function fetchAllTrackerDoneItems() {
  const all = [];
  const seen = new Set();
  for (const t of TRACKERS) {
    const items = fetchTrackerItems(t);
    console.log(`  ${t.repo}#${t.number}: ${items.length} done items`);
    for (const it of items) {
      if (seen.has(it.url)) continue;
      seen.add(it.url);
      all.push(it);
    }
  }
  return all;
}

// === Heuristics ===

// Stripping the `b2-`/`backblaze-` prefix produces a better catalog id when
// the remainder is still descriptive (e.g. `b2-zeroshot-image-classifier` →
// `zeroshot-image-classifier`). But for short repo names like `b2-action` or
// `b2-vscode` it collapses to a single generic word ("action", "vscode") that
// loses the project identity. So: only strip when the result is multi-token.
function stripBrandPrefix(name) {
  const stripped = name.replace(/^(backblaze|b2)-/, "");
  if (stripped === name) return name;
  // Multi-token (contains a separator) → stripping is safe.
  if (/[-_]/.test(stripped)) return stripped;
  // Single token → keep the prefix so id/title stays distinct from generic
  // English words. e.g. `b2-action` → `b2-action`, `b2-vscode` → `b2-vscode`.
  return name;
}

function prettifyTitle(name) {
  return stripBrandPrefix(name)
    .split(/[-_]/)
    .map((p) => {
      if (/^b2$/i.test(p)) return "B2"; // Always uppercase the brand acronym.
      return /^[A-Z0-9]+$/.test(p) ? p : (p[0]?.toUpperCase() ?? "") + p.slice(1);
    })
    .join(" ");
}

function slugFromRepoName(name) {
  return stripBrandPrefix(name)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function slugFromUrl(u) {
  try {
    const host = new URL(u).host;
    // Useless host slugs — github.com sub-issue URLs would otherwise produce id "github".
    if (/^(www\.)?github\.com$/i.test(host)) return null;
    return host
      .replace(/^docs?\./, "")
      .replace(/\.\w+$/, "")
      .replace(/[^a-z0-9-]+/gi, "-")
      .toLowerCase();
  } catch {
    return null;
  }
}

function slugFromTitle(title) {
  return (title || "")
    .toLowerCase()
    .replace(/\s+integration$/i, "") // "CVAT Integration" → "cvat"
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Normalize an id for dedup matching. Strips dashes and underscores so
// "ml-flow", "mlflow", and "ml_flow" all collide to the same key. Used ONLY
// for "is this a duplicate?" checks — the visible id keeps its dashes.
function normalizeId(id) {
  return (id || "").toLowerCase().replace(/[-_]+/g, "");
}

// Resolve where a card should link to, based on conventions:
//   - topic `pypi` → https://pypi.org/project/<repoName>/
//   - topic `npm`  → https://www.npmjs.com/package/<repoName>
//   - default     → the GitHub repo
function resolveUrl(repo, name, topics) {
  if (topics.includes("pypi")) return `https://pypi.org/project/${name}/`;
  if (topics.includes("npm")) return `https://www.npmjs.com/package/${name}`;
  return `https://github.com/${repo}`;
}

// Clamp a tagline to the schema's 80-char cap WITHOUT cutting mid-word. If the
// raw value fits, return it unchanged. Otherwise back up to the last word
// boundary inside the budget and append `"…"`. Falls back to a hard slice if
// no whitespace exists in the budgeted prefix (URLs, run-on identifiers).
//
// The naïve `.slice(0, 80)` we used previously produced cards ending in
// strings like "background removal app using Tra" or "managing a" — readable
// but obviously truncated. The ellipsis cue is universally recognised.
const TAGLINE_MAX = 80;
function clampTagline(raw) {
  if (typeof raw !== "string") return "";
  const s = raw.trim().replace(/\s+/g, " ");
  if (s.length <= TAGLINE_MAX) return s;
  // Reserve 1 char for the ellipsis (`…` is a single codepoint).
  const budget = TAGLINE_MAX - 1;
  const clipped = s.slice(0, budget);
  const lastSpace = clipped.lastIndexOf(" ");
  // Only honour the word boundary when it's not laughably early — otherwise
  // we'd return "Backblaze…" for "BackblazeB2-with-no-spaces-..." style input.
  if (lastSpace >= 40) return `${clipped.slice(0, lastSpace).trimEnd()}…`;
  return `${clipped.trimEnd()}…`;
}

// === Drafting ===

/**
 * Returns { entry, missing[] }. `missing` is non-empty only for things we
 * fundamentally can't infer (right now: just the repo description). Every other
 * field has a deterministic inference path.
 *
 * The repo has already been filtered to `b2-labs`-tagged ones; this is the
 * sole opt-in mechanism. From here, we infer categories from standard topics,
 * type from name + topic patterns, language from GitHub, etc.
 */
function draftRepoEntry(r) {
  const topics = (r.topics ?? []).map((t) => t.toLowerCase());
  const missing = [];

  // Categories — inferred from standard open-source topics. Falls back to a
  // single sensible default ("developer-tools") rather than warning, since the
  // user explicitly accepted "infer as much as possible".
  const cats = new Set();
  for (const t of topics) {
    if (TOPIC_TO_CATEGORY[t]) cats.add(TOPIC_TO_CATEGORY[t]);
  }
  if (r.name.startsWith("awesome-")) cats.add("awesome-lists");
  if (cats.size === 0) cats.add("developer-tools");

  // Type — inferred from name patterns + standard topics.
  let type;
  if (r.name.startsWith("awesome-")) type = "list";
  else if (topics.includes("vscode-extension") || r.name.endsWith("-vscode")) type = "extension";
  else if (r.name.includes("skill") || topics.includes("agent-skill")) type = "skill";
  else if (
    topics.includes("sample") ||
    r.name.startsWith("sample-") ||
    r.name.includes("-sample") ||
    r.name.includes("-samples")
  ) {
    type = "sample";
  } else if (topics.includes("sdk") || r.name.includes("-sdk-") || r.name.endsWith("-sdk")) {
    type = "sdk";
  } else type = "tool";

  // Language — primary GitHub language → catalog id; falls back to markdown
  // for awesome-lists or where the language is unknown.
  let language;
  if (r.language && LANGUAGE_MAP[r.language]) language = LANGUAGE_MAP[r.language];
  else if (r.name.startsWith("awesome-")) language = "markdown";
  else language = "markdown";

  // Icon — derived from inferred categories.
  const icon =
    type === "list"
      ? "star"
      : cats.has("notebooks")
        ? "notebook"
        : cats.has("ide-extensions")
          ? "code"
          : cats.has("agent-skills")
            ? "bot"
            : cats.has("infra")
              ? "server"
              : cats.has("data-pipelines")
                ? "flow"
                : cats.has("ai-ml")
                  ? "sparkle"
                  : "wrench";

  // `featured` is never inferred — it's a curator decision (or, for tracker
  // entries, the `B2 Feature on website` label drives it via the
  // bidirectional reconciliation in merge-discovered).
  const featured = false;

  // The only field we genuinely can't infer is the description. If it's empty,
  // we still produce an entry but flag it so the PR body shows what's missing.
  if (!r.description) {
    missing.push("description (set the repo description on GitHub)");
  }
  const desc = r.description || `TODO: write a description for ${r.name}.`;
  const tagline = clampTagline(
    r.description ? r.description.split(/(?<=[.!?])\s/)[0] : `TODO: ${r.name}`,
  );

  const entry = {
    id: slugFromRepoName(r.name),
    title: prettifyTitle(r.name),
    tagline,
    description: desc,
    categories: [...cats],
    type,
    language,
    // Strip the control topic from user-facing tags. Cap at 6.
    tags: (r.topics ?? []).filter((t) => t.toLowerCase() !== INCLUDE_TOPIC).slice(0, 6),
    repo: r.repo,
    url: resolveUrl(r.repo, r.name, topics),
    icon,
    featured,
  };

  return { entry, missing };
}

async function draftUpstreamEntry(item) {
  const meta = parseTrackerBody(item.body) ?? {};
  const missing = [];

  // Card destination URL — preferred order:
  //   1. meta.url             explicit override
  //   2. meta.docs            published upstream docs page (best UX)
  //   3. meta.pull_request    merged PR (browsable while docs are still TBD)
  //   4. meta.pull_request_rejected   superseded PR — last-resort context
  //   5. meta.issue           upstream issue
  //   6. extractDestUrlFromBody  freeform-text fallback for legacy bodies
  const url =
    meta.url ||
    meta.docs ||
    meta.pull_request ||
    meta.pull_request_rejected ||
    meta.issue ||
    extractDestUrlFromBody(item.body) ||
    null;
  if (!url) {
    missing.push(
      "url (closed sub-issue has no docs:/pull_request:/issue: URL — fill one in upstream)",
    );
  }

  // One HTTP per sub-issue to grab page title + meta description for free.
  const fetched = await fetchUrlMetadata(url);

  const source = meta.source || item.title.replace(/\s+(integration|support|tool)s?$/i, "");
  const tagline = clampTagline(meta.tagline ?? fetched?.title ?? `Backblaze B2 with ${source}.`);
  const description =
    meta.description ??
    fetched?.description ??
    `TODO: describe how ${source} integrates with Backblaze B2.`;
  if (!meta.tagline && !fetched?.title)
    missing.push("tagline (couldn't fetch page title — set `tagline:` in the meta block)");
  if (!meta.description && !fetched?.description)
    missing.push(
      "description (couldn't fetch page description — set `description:` in the meta block)",
    );

  // Categories — the only field with no good auto-source. `ai-ml` is a sensible
  // default for upstream B2 integrations (most are AI tooling); curator can
  // refine in labs.json after merge.
  const cats =
    meta.categories
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  if (cats.length === 0) cats.push("ai-ml");

  const language = meta.language || "python";

  // Tags: meta first, else heuristic (URL host word + source slug + s3-compatible).
  let tags = meta.tags
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!tags || tags.length === 0) {
    const host = (() => {
      try {
        return new URL(url).host.replace(/^(www|docs)\./, "").split(".")[0];
      } catch {
        return null;
      }
    })();
    tags = [host, source.toLowerCase().replace(/\s+/g, "-"), "s3-compatible"]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i);
  }

  const icon = meta.icon || "flow";
  // Featured-on-website is curator intent expressed as a tracker label —
  // attaching `B2 Feature on website` to the sub-issue surfaces the card in
  // the featured tier on the gallery. Body `featured: true` still works as an
  // explicit override (legacy / power-user path).
  const labels = (item.labels ?? []).map((l) => (typeof l === "string" ? l.toLowerCase() : ""));
  const featuredByLabel = labels.includes("b2 feature on website");
  const featured = featuredByLabel || String(meta.featured ?? "").toLowerCase() === "true";

  // Slug priority: explicit `id` → URL host (e.g. docs.meltano.com → "meltano")
  // → user_agent_extra (sanitised — strips internal `b2ai-` prefix and
  // normalises) → title slug → fallback. Putting host before title means
  // canonical brand domains win over slightly-off issue titles.
  const userAgentSlug = meta.user_agent_extra
    ? meta.user_agent_extra
        .toLowerCase()
        .replace(/^b2ai-/, "")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : null;
  const id =
    meta.id ||
    slugFromUrl(url) ||
    userAgentSlug ||
    slugFromTitle(meta.title || item.title) ||
    "untitled";

  const entry = {
    id,
    title: meta.title || item.title.replace(/\s+integration$/i, ""),
    tagline,
    description,
    categories: cats,
    type: "integration",
    language,
    tags,
    repo: null,
    source,
    url,
    icon,
    featured,
  };
  return { entry, missing };
}

// === Reconcile ===

const labs = JSON.parse(fs.readFileSync(labsPath, "utf8"));
const existingByRepo = new Map(labs.integrations.filter((i) => i.repo).map((i) => [i.repo, i]));
const existingByUrlHost = new Map();
for (const i of labs.integrations) {
  if (i.repo) continue;
  try {
    existingByUrlHost.set(new URL(i.url).host, i);
  } catch {}
}
const existingIds = new Set(labs.integrations.map((i) => i.id));
// Normalized-id index for dedup. Catches "mlflow" vs "ml-flow" vs "ml_flow" —
// they all collapse to "mlflow" so we skip the proposal instead of creating a
// duplicate card with a `-upstream` suffix.
const existingNormalizedIds = new Set(labs.integrations.map((i) => normalizeId(i.id)));

console.log("Discovering candidates ...");
const allRepos = []; // all public, non-archived repos in our orgs
const taggedRepos = []; // subset that carry the `b2-labs` topic
const orgFailures = [];
for (const org of ORGS) {
  try {
    const found = listOrgRepos(org);
    const tagged = found.filter(hasIncludeTopic);
    console.log(
      `  ${org}: ${found.length} public, non-archived (${tagged.length} tagged \`${INCLUDE_TOPIC}\`)`,
    );
    allRepos.push(...found);
    taggedRepos.push(...tagged);
  } catch (e) {
    orgFailures.push({ org, message: e.message.split("\n")[0] });
    console.warn(`  ! ${org}: ${e.message.split("\n")[0]}`);
  }
}

// Fail loudly if both org listings collapsed — that's a `gh`-not-on-PATH or
// network-outage signal, not "the orgs are empty". Without this guard the
// stale audit later would scream "every catalog entry is missing!" and merge
// would happily wipe the world. The tracker fetch can fail silently because
// repo discovery alone is enough to keep the catalog populated.
if (orgFailures.length === ORGS.length) {
  console.error(
    `\n✘ All ${ORGS.length} source-org listings failed. Aborting before stale audit could fire false-positives.`,
  );
  for (const f of orgFailures) console.error(`  - ${f.org}: ${f.message}`);
  console.error(
    "  Common causes: `gh` not on PATH; missing GH_TOKEN/GITHUB_TOKEN; rate limit; network outage.",
  );
  process.exit(2);
}

const reposByName = new Map(allRepos.map((r) => [r.repo, r]));
const upstream = fetchAllTrackerDoneItems();

const proposed = [];
// `refreshables` holds drafted entries whose catalog counterpart already
// exists — used by merge-discovered to swap out TODO placeholders when the
// upstream description has since been filled in. Indexed by id.
const refreshables = {};
const seenRepos = new Set();
const seenUpstreamHosts = new Set();

for (const r of taggedRepos) {
  seenRepos.add(r.repo);
  // Draft every candidate (even ones already in labs.json) so we can refresh
  // stale entries from upstream metadata.
  const { entry, missing } = draftRepoEntry(r);
  if (existingByRepo.has(r.repo) || existingNormalizedIds.has(normalizeId(entry.id))) {
    // Already in catalog — emit as a refresh candidate keyed by the EXISTING
    // catalog id (not the freshly-slugged one, since the curator may have
    // renamed it). Look up the existing entry by repo to find its id.
    const existing = existingByRepo.get(r.repo);
    const id = existing?.id ?? entry.id;
    refreshables[id] = { tagline: entry.tagline, description: entry.description };
    continue;
  }
  if (existingIds.has(entry.id)) entry.id = `${entry.id}-${r.repo.split("/")[0]}`;
  proposed.push({ ...entry, _complete: missing.length === 0, _missing: missing, _source: r.repo });
}

// Upstream items: draft in parallel — each does an HTTP fetch for page metadata.
//
// Two ways a tracker entry can resolve to "implementation lives in our orgs":
//
//   1. Labels — `B2 Tool/Plugin` or `B2 Example` mean a backblaze-labs/* or
//      backblaze-b2-samples/* repo owns the integration; repo discovery handles
//      the card.
//   2. `plugin:` field in the body — defense in depth when labels are missing
//      but the body explicitly points at one of our repos.
//
// "B2 Integration" / "B2 Documentation" labels (with no plugin: field) produce
// upstream entries (repo: null, source: "<Project>").
const PLUGIN_OUR_ORGS_RE =
  /^https?:\/\/(www\.)?github\.com\/(backblaze-labs|backblaze-b2-samples)\//i;
const FEATURE_LABEL = "b2 feature on website";

// Bidirectional reconciliation map for the `featured` flag. Built from tracker
// labels regardless of whether the sub-issue produces an upstream card or a
// repo-driven card. The value is "is `B2 Feature on website` currently on the
// sub-issue?" — applied by merge-discovered.mjs which sets `featured` on the
// matching catalog entry (true→true, false→false). This makes the label the
// source of truth: removing the label flips the card off automatically.
//
// Match keys:
//   - For upstream items: the drafted id (e.g. "cvat", "mlflow", "meltano")
//   - For repo-driven items (`plugin:` field): the repo's basename
//     (e.g. "comfyui-cloud-storage")
const featuredReconciliation = {};

const upstreamDrafts = await Promise.all(
  upstream.map(async (item) => {
    const labels = (item.labels ?? []).map((l) => l.toLowerCase());
    const featuredIntent = labels.includes(FEATURE_LABEL);
    const meta = parseTrackerBody(item.body);

    const livesInOurOrgs = labels.includes("b2 tool/plugin") || labels.includes("b2 example");
    const pluginInOurOrgs = meta?.plugin && PLUGIN_OUR_ORGS_RE.test(meta.plugin);

    // Record featured intent for the repo-driven catalog entry. The plugin
    // field is the strongest signal of "this tracker entry corresponds to
    // <our-org>/<repo>". The repo basename must be normalized through
    // `slugFromRepoName` so it matches the catalog `id` — otherwise
    // `b2-whisper-transformersjs-transcriber` (repo name) won't reconcile with
    // `whisper-transformersjs-transcriber` (catalog id with the prefix
    // stripped) and the flip silently no-ops.
    if ((livesInOurOrgs || pluginInOurOrgs) && meta?.plugin) {
      const repoBasename = meta.plugin
        .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
        .replace(/\/$/, "")
        .split("/")
        .pop();
      if (repoBasename) {
        const catalogId = slugFromRepoName(repoBasename);
        if (catalogId) featuredReconciliation[catalogId] = featuredIntent;
      }
    }
    if (livesInOurOrgs) return null; // repo discovery has it
    if (pluginInOurOrgs) return null;

    let host = null;
    try {
      host = new URL(item.url).host;
    } catch {}
    if (host) {
      seenUpstreamHosts.add(host);
    }
    const drafted = await draftUpstreamEntry(item);

    // Record featured intent for the upstream-driven catalog entry. Always
    // record (even when we'll skip below for "already in catalog") — this is
    // how the flip-off case works: existing CVAT entry whose label gets
    // removed will see false here and merge-discovered will clear featured.
    featuredReconciliation[drafted.entry.id] = featuredIntent;

    // Already in catalog → emit as a refresh candidate and skip the proposal.
    if (existingNormalizedIds.has(normalizeId(drafted.entry.id))) {
      refreshables[drafted.entry.id] = {
        tagline: drafted.entry.tagline,
        description: drafted.entry.description,
      };
      return null;
    }
    return { item, ...drafted };
  }),
);
for (const d of upstreamDrafts) {
  if (!d) continue;
  const { entry, missing, item } = d;
  if (existingIds.has(entry.id)) entry.id = `${entry.id}-upstream`;
  proposed.push({
    ...entry,
    _complete: missing.length === 0,
    _missing: missing,
    _source: `${item.source}: ${item.title}`,
  });
}

// Stale audit. We NEVER auto-remove entries — these are reported for manual
// maintainer review only. Two distinct cases:
//   1. Repo no longer exists in either org (deleted, transferred, made private).
//   2. Repo exists in an org but lost the `b2-labs` topic — likely accidental,
//      flagged loudly so the maintainer can re-tag.
//
// Skip upstream-integration entries (type: "integration"). They carry a `repo`
// pointing at the UPSTREAM project (e.g. `mlflow/mlflow`) so `sync-stats` can
// fetch star counts — that repo will never appear in our source orgs, so the
// "no longer in source orgs" check would false-positive on every run. Same
// goes for entries whose repo isn't in one of our two orgs at all.
const SOURCE_ORG_RE = new RegExp(
  `^(${ORGS.map((o) => o.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|")})/`,
);
const stale = [];
for (const i of labs.integrations) {
  if (!i.repo) continue;
  if (i.type === "integration") continue;
  if (!SOURCE_ORG_RE.test(i.repo)) continue;
  const liveRepo = reposByName.get(i.repo);
  if (!liveRepo) {
    stale.push({
      id: i.id,
      repo: i.repo,
      reason: "repo no longer found in source orgs (deleted? transferred? made private?)",
      severity: "removed",
    });
  } else if (!hasIncludeTopic(liveRepo)) {
    stale.push({
      id: i.id,
      repo: i.repo,
      reason: `repo exists but \`${INCLUDE_TOPIC}\` topic is missing — possibly accidental. Re-add the topic on GitHub to keep auto-discovery working.`,
      severity: "topic-missing",
    });
  }
}

const complete = proposed.filter((p) => p._complete);
const incomplete = proposed.filter((p) => !p._complete);

// Compute which existing catalog entries will see a featured-flag flip on the
// next merge. Surfaces "label was added/removed since last sync" as a real
// change even when there are no new proposals — otherwise the early-exit
// below would drop the reconciliation on the floor.
const featuredFlips = [];
for (const e of labs.integrations) {
  if (!(e.id in featuredReconciliation)) continue;
  const desired = featuredReconciliation[e.id];
  if (Boolean(e.featured) !== desired) {
    featuredFlips.push({ id: e.id, from: Boolean(e.featured), to: desired });
  }
}

// TODO-placeholder refresh detection — surfaces existing catalog entries whose
// stale "TODO:" tagline/description can be filled in from fresh upstream
// metadata. Same purpose as featuredFlips: keep early-exit from dropping
// useful work when there are no new proposals.
const isTodoPlaceholder = (v) => typeof v === "string" && /^TODO:\s/i.test(v);
const refreshCandidates = [];
for (const e of labs.integrations) {
  const r = refreshables[e.id];
  if (!r) continue;
  const fields = [];
  if (isTodoPlaceholder(e.tagline) && r.tagline && !isTodoPlaceholder(r.tagline))
    fields.push("tagline");
  if (isTodoPlaceholder(e.description) && r.description && !isTodoPlaceholder(r.description))
    fields.push("description");
  if (fields.length > 0) refreshCandidates.push({ id: e.id, fields });
}

console.log(`\nProposed:`);
console.log(`  ${complete.length} COMPLETE  (auto-mergeable)`);
console.log(`  ${incomplete.length} NEEDS-METADATA  (require upstream fix)`);
console.log(`  ${stale.length} STALE  (manual review)`);
if (featuredFlips.length) {
  console.log(`  ${featuredFlips.length} FEATURED-FLIP  (label change reconciles existing entry)`);
  for (const f of featuredFlips) {
    console.log(`    - ${f.id}: featured ${f.from} → ${f.to}`);
  }
}
if (refreshCandidates.length) {
  console.log(
    `  ${refreshCandidates.length} REFRESH  (existing TODO placeholders fillable from upstream)`,
  );
  for (const r of refreshCandidates) {
    console.log(`    - ${r.id}: ${r.fields.join(", ")}`);
  }
}

if (
  complete.length === 0 &&
  incomplete.length === 0 &&
  stale.length === 0 &&
  featuredFlips.length === 0 &&
  refreshCandidates.length === 0
) {
  if (fs.existsSync(discoveredPath)) fs.unlinkSync(discoveredPath);
  console.log("\n✔ Catalog in sync — nothing to do.");
  process.exit(0);
}

if (incomplete.length) {
  console.log(`\nNeeds-metadata details:`);
  for (const p of incomplete) {
    console.log(`  - ${p._source}`);
    for (const m of p._missing) console.log(`      missing: ${m}`);
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  sources: { orgs: ORGS, trackers: TRACKERS.map((t) => `${t.repo}#${t.number}`) },
  complete,
  incomplete,
  stale,
  // Drafted entries that already have a catalog counterpart — used by
  // merge-discovered.mjs to refresh TODO placeholders with fresh upstream
  // text. Conservative: only TODO-prefixed fields get touched.
  refreshables,
  // Tracker labels are the source of truth for `featured`. merge-discovered
  // applies this map to existing entries (set/clear, never just-set).
  featuredReconciliation,
};
fs.writeFileSync(discoveredPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nWrote ${path.relative(root, discoveredPath)}`);
console.log(`Review or run: npm run merge-discovered  (or merge-discovered -- --auto for CI)`);
