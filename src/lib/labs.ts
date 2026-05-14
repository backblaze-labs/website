import statsRaw from "~/data/github-stats.json";
import labsRaw from "~/data/labs.json";
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
  language: string;
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
  preview?: string | null;
  icon?: string;
  accent?: "red" | "navy" | "cream";
  featured?: boolean;
}

export interface LabsCatalog {
  version: number;
  meta: {
    title: string;
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

export const catalog: LabsCatalog = labs;

export function statsFor(id: string): GitHubStats | undefined {
  return stats[id];
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
 *   1. `featured: true` items first.
 *   2. Then items with a real preview image (manual or auto-discovered) —
 *      a wall of branded artwork reads better than a wall of placeholder
 *      gradients.
 *   3. Alphabetical by title within each tier.
 *
 * Returns a new array; never mutates the input.
 */
export function sortIntegrations(items: Integration[]): Integration[] {
  return [...items].sort((a, b) => {
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
    counts[i.language] = (counts[i.language] ?? 0) + 1;
  }
  return counts;
}
