import type { APIRoute } from "astro";
import { catalog, previewUrl, projectDetailPath, sortIntegrations, statsFor } from "~/lib/labs";

/**
 * JSON Feed 1.1 — https://www.jsonfeed.org/
 * Static at build time. Useful for syndication, RSS readers, Slack/Discord webhooks,
 * IDE plugins, and dashboards.
 *
 * Item order mirrors the gallery (`featured → has-preview → alphabetical`) so
 * feed consumers see the same priority a human visitor does.
 *
 * `date_modified` falls back to the build timestamp when no upstream stats are
 * available — a single stable string per build, not a fresh `Date.now()` per
 * item (which would churn every subscriber on each rebuild).
 */
export const GET: APIRoute = ({ site }) => {
  const baseUrl = (site ?? new URL("https://backblazelabs.com")).toString().replace(/\/$/, "");
  const path = import.meta.env.BASE_URL.replace(/\/$/, "");
  const buildTime = new Date().toISOString();

  // Catalog-only items point straight to their external destination (Marketplace /
  // PyPI / GitHub / etc.). Items with a site-owned detail page use that canonical
  // landing for both `id` and `url`, while preserving the repository in
  // `_external_urls.repository`.
  //
  // `_external_urls` is a JSON-Feed `_` extension (per the spec, any
  // underscore-prefixed top-level key is treated as a custom extension and
  // passed through to consumers untouched). We carry `site` / `docs` /
  // `example` / `demo` here so feed readers / IDE plugins / dashboards can
  // deep-link into the project's own pages.
  const items = sortIntegrations(catalog.integrations).map((i) => {
    const stats = statsFor(i.id);
    const detailPath = projectDetailPath(i, path);
    const itemUrl = detailPath ? new URL(detailPath, `${baseUrl}/`).toString() : i.url;
    const preview = previewUrl(i, path);
    const imageUrl = preview ? new URL(preview, `${baseUrl}/`).toString() : null;
    const external: Record<string, string> = {};
    if (detailPath && i.repo) external.repository = `https://github.com/${i.repo}`;
    if (i.site) external.site = i.site;
    if (i.docs) external.docs = i.docs;
    if (i.example) external.example = i.example;
    if (i.demo) external.demo = i.demo;
    return {
      id: detailPath ? itemUrl : `${baseUrl}${path}/#${i.id}`,
      url: itemUrl,
      title: i.title,
      summary: i.tagline,
      content_text: i.description,
      ...(imageUrl ? { image: imageUrl } : {}),
      tags: [...i.categories, ...i.tags, i.type, ...i.languages],
      date_modified: stats?.updated ?? buildTime,
      ...(Object.keys(external).length > 0 ? { _external_urls: external } : {}),
    };
  });

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: catalog.meta.title,
    description: catalog.meta.tagline,
    home_page_url: `${baseUrl}${path}/`,
    feed_url: `${baseUrl}${path}/feed.json`,
    favicon: `${baseUrl}${path}/favicon.svg`,
    authors: [{ name: "Backblaze Labs", url: catalog.meta.github }],
    items,
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: { "content-type": "application/feed+json; charset=utf-8" },
  });
};
