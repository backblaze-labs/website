import type { APIRoute } from "astro";
import { catalog, previewUrl, statsFor } from "~/lib/labs";

/**
 * JSON Feed 1.1 — https://www.jsonfeed.org/
 * Static at build time. Useful for syndication, RSS readers, Slack/Discord webhooks,
 * IDE plugins, and dashboards.
 */
export const GET: APIRoute = ({ site }) => {
  const baseUrl = (site ?? new URL("https://backblaze-labs.github.io"))
    .toString()
    .replace(/\/$/, "");
  const path = import.meta.env.BASE_URL.replace(/\/$/, "");

  // Each item points straight to the integration's destination (Marketplace / PyPI /
  // GitHub / etc.) — there's no detail page to route through. The id anchors back to
  // the gallery for clients that want to deep-link into the catalog UI.
  const items = catalog.integrations.map((i) => {
    const stats = statsFor(i.id);
    return {
      id: `${baseUrl}${path}/#${i.id}`,
      url: i.url,
      title: i.title,
      summary: i.tagline,
      content_text: i.description,
      image: previewUrl(i),
      tags: [...i.categories, ...i.tags, i.type, i.language],
      date_modified: stats?.updated ?? new Date().toISOString(),
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
