import statsRaw from "~/data/github-stats.json";
import labsRaw from "~/data/labs.json";
import linksRaw from "~/data/links.json";
import previewsRaw from "~/data/previews.json";

export interface Category {
  id: string;
  label: string;
  icon?: string;
}

export interface IntegrationType {
  id: string;
  label: string;
}

export interface Language {
  id: string;
  label: string;
}

export interface Integration {
  id: string;
  title: string;
  tagline: string;
  description: string;
  categories: string[];
  type: string;
  languages: string[];
  tags: string[];
  /**
   * GitHub `owner/name` for first-party Labs projects. Omit (or set null) for upstream
   * integrations that live in someone else's project (e.g. MLflow's B2 docs page).
   */
  repo?: string | null;
  /**
   * Human-readable "where this lives" label, used in the card footer when there's no
   * `repo`. e.g. "MLflow", "Terraform Registry". Falls back to the URL host.
   */
  source?: string | null;
  url: string;
  site?: string | null;
  docs?: string | null;
  demo?: string | null;
  example?: string | null;
  preview?: string | null;
  icon?: string;
  featured?: boolean;
}

interface CompanionLinks {
  site?: string;
  docs?: string;
  demo?: string;
  example?: string;
  repo?: string;
}

export interface IntegrationLink {
  kind: "primary" | "docs" | "example" | "demo" | "site" | "repo";
  label: string;
  url: string;
  primary: boolean;
}

export interface LabsCatalog {
  version: number;
  meta: {
    title: string;
    /** Longer, SEO-optimized title used only for the homepage `<title>`. */
    homeTitle: string;
    tagline: string;
    description: string;
    github: string;
    homepage?: string;
    b2?: string;
  };
  categories: Category[];
  types: IntegrationType[];
  languages: Language[];
  integrations: Integration[];
}

export interface GitHubStats {
  stars: number;
  forks: number;
  lang: string | null;
  updated: string;
  license: string | null;
  archived: boolean;
  openIssues: number;
  description: string | null;
  repo: string;
  fetchedAt: string;
}

const labs = labsRaw as unknown as LabsCatalog;
const stats = statsRaw as unknown as Record<string, GitHubStats>;
const companionLinks = linksRaw as Record<string, CompanionLinks>;

export const catalog: LabsCatalog = labs;

export function statsFor(id: string): GitHubStats | undefined {
  return stats[id];
}

function normalizeUrl(value: string): string {
  try {
    const u = new URL(value);
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function isDocsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return /^docs?\./i.test(u.host) || /(^|\/)docs?(\/|$)/i.test(u.pathname);
  } catch {
    return false;
  }
}

function isGitHubUrl(value: string): boolean {
  try {
    return /^(www\.)?github\.com$/i.test(new URL(value).host);
  } catch {
    return false;
  }
}

function primaryLinkLabel(item: Integration, companion: CompanionLinks): IntegrationLink["label"] {
  if (item.example && normalizeUrl(item.url) === normalizeUrl(item.example)) return "Example";
  if (item.demo && normalizeUrl(item.url) === normalizeUrl(item.demo)) return "Demo";
  const docsUrl = item.docs ?? companion.docs;
  if (docsUrl && normalizeUrl(item.url) === normalizeUrl(docsUrl)) return "Docs";
  if (isDocsUrl(item.url)) return docsUrl ? "Guide" : "Docs";
  if (isGitHubUrl(item.url)) return "Repo";
  return "Open";
}

export function integrationLinks(item: Integration): IntegrationLink[] {
  const companion = companionLinks[item.id] ?? {};
  const links: IntegrationLink[] = [];
  const seen = new Set<string>();
  const add = (
    kind: IntegrationLink["kind"],
    label: string,
    url: string | null | undefined,
    primary = false,
  ) => {
    if (!url) return;
    const key = normalizeUrl(url);
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ kind, label, url, primary });
  };

  add("primary", primaryLinkLabel(item, companion), item.url, true);
  add("docs", "Docs", item.docs ?? companion.docs);
  add("example", "Example", item.example ?? companion.example);
  add("demo", "Demo", item.demo ?? companion.demo);
  add("site", "Site", item.site ?? companion.site);
  add(
    "repo",
    "Repo",
    item.repo
      ? `https://github.com/${item.repo}`
      : companion.repo
        ? `https://github.com/${companion.repo}`
        : null,
  );

  return links;
}

const previews = previewsRaw as Record<string, string>;

/**
 * Resolve the preview image URL for an integration.
 *
 * Order:
 *  1. Explicit `preview` field in `labs.json` (manual override). When the value
 *     starts with `http(s)://` it's returned as-is; relative paths get
 *     prefixed with the site's `BASE_URL` so GitHub-Pages subpath deployments
 *     resolve correctly.
 *  2. Auto-discovered URL in `previews.json` — populated by `npm run sync-previews`,
 *     which walks the upstream destination (preferring `<video>` heroes, then
 *     `<img>`, then `og:image`) for upstream items and scans the repo's README
 *     for first-party items. GitHub-hosted OG cards (`opengraph.githubassets.com`)
 *     are deliberately rejected — they ship with a fixed white background and
 *     clash with the dark gallery aesthetic.
 *  3. `null` — caller renders the brand-gradient placeholder.
 */
export function previewUrl(item: Integration, base = ""): string | null {
  if (item.preview) {
    if (item.preview.startsWith("http")) return item.preview;
    return `${base}${item.preview.startsWith("/") ? "" : "/"}${item.preview}`;
  }
  return previews[item.id] ?? null;
}

/**
 * True when the catalog has a real preview image for this integration (manual
 * override or auto-discovered from README/upstream walk). False means the card
 * will fall back to the brand-gradient placeholder.
 *
 * Used by `sortIntegrations` to surface visually-richer cards first.
 */
export function hasPreview(item: Integration): boolean {
  return Boolean(item.preview) || Boolean(previews[item.id]);
}

/**
 * Canonical display order for the gallery and category pages:
 *
 *   1. Awesome lists (`type: "list"`) always sink to the bottom — they're
 *      meta-resources, not projects, so they shouldn't crowd the top.
 *   2. `featured: true` items first (among non-lists).
 *   3. Then items with a real preview image (manual or auto-discovered) —
 *      a wall of branded artwork reads better than a wall of placeholder
 *      gradients.
 *   4. Alphabetical by title within each tier.
 *
 * Returns a new array; never mutates the input.
 */
export function sortIntegrations(items: Integration[]): Integration[] {
  return [...items].sort((a, b) => {
    const al = a.type === "list" ? 1 : 0;
    const bl = b.type === "list" ? 1 : 0;
    if (al !== bl) return al - bl;
    const af = a.featured ? 1 : 0;
    const bf = b.featured ? 1 : 0;
    if (af !== bf) return bf - af;
    const ap = hasPreview(a) ? 1 : 0;
    const bp = hasPreview(b) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return a.title.localeCompare(b.title);
  });
}

export function countByCategory(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const i of labs.integrations) {
    for (const c of i.categories) {
      counts[c] = (counts[c] ?? 0) + 1;
    }
  }
  return counts;
}

export function countByType(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const i of labs.integrations) {
    counts[i.type] = (counts[i.type] ?? 0) + 1;
  }
  return counts;
}

export function countByLanguage(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const i of labs.integrations) {
    for (const l of i.languages) {
      counts[l] = (counts[l] ?? 0) + 1;
    }
  }
  return counts;
}
