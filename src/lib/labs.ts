import statsRaw from "~/data/github-stats.json";
import labsRaw from "~/data/labs.json";

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
export const githubStats = stats;

export function statsFor(id: string): GitHubStats | undefined {
  return stats[id];
}

export const featured = labs.integrations.filter((i) => i.featured);

/**
 * Resolve the preview image URL for an integration.
 *
 * Order:
 *  1. Explicit `preview` field — custom image (committed to public/previews/<id>.png,
 *     or hosted elsewhere). Use this when you have an actual app screenshot.
 *  2. Brand-gradient placeholder at /previews/placeholder.svg.
 *
 * We deliberately don't fall back to /og/<id>.png — the OG image carries the title and
 * tagline as text, which would be redundant inside a card that already shows them.
 * Reserved for og:image meta tags only.
 */
export function previewUrl(item: Integration, base = ""): string {
  if (item.preview) {
    if (item.preview.startsWith("http")) return item.preview;
    return `${base}${item.preview.startsWith("/") ? "" : "/"}${item.preview}`;
  }
  return `${base}/previews/placeholder.svg`;
}

/**
 * GitHub social preview URL — useful as a fallback or for the "View on GitHub" preview.
 * Not used as the default card image (see `previewUrl`).
 */
export function githubSocialUrl(repo: string): string {
  return `https://opengraph.githubassets.com/1/${repo}`;
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
