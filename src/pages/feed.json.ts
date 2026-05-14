import type { APIRoute } from "astro";
import { catalog, previewUrl, sortIntegrations, statsFor } from "~/lib/labs";

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
  const baseUrl = (site ?? new URL("https://backblaze-labs.github.io"))
    .toString()
    .replace(/\/$/, "");
  const path = import.meta.env.BASE_URL.replace(/\/$/, "");
  const buildTime = new Date().toISOString();

  // Each item points straight to the integration's destination (Marketplace / PyPI /
  // GitHub / etc.) — there's no detail page to route through. The id anchors back to
  // the gallery for clients that want to deep-link into the catalog UI.
  const items = sortIntegrations(catalog.integrations).map((i) => {
    const stats = statsFor(i.id);
    return {
      id: `${baseUrl}${path}/#${i.id}`,
      url: i.url,
      title: i.title,
      summary: i.tagline,
      content_text: i.description,
      image: previewUrl(i),
      tags: [...i.categories, ...i.tags, i.type, i.language],
      date_modified: stats?.updated ?? buildTime,
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
