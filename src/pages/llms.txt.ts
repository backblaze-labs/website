import type { APIRoute } from "astro";
import { catalog, sortIntegrations } from "~/lib/labs";

/**
 * /llms.txt — https://llmstxt.org/
 *
 * A plain-markdown map of the catalog for LLMs and AI agents that fetch a site's
 * context. Generated at build time from the same `catalog` the gallery renders,
 * so it never drifts. Format: H1, a blockquote summary, then one section per
 * category listing each project as `[title](url): tagline`.
 *
 * Project links point straight to each integration's upstream destination
 * (matching the gallery cards); site-owned resources are listed under "Resources".
 */
export const GET: APIRoute = ({ site }) => {
  const baseUrl = (site ?? new URL("https://backblazelabs.com")).toString().replace(/\/$/, "");
  const path = import.meta.env.BASE_URL.replace(/\/$/, "");
  const home = `${baseUrl}${path}`;

  const sections = catalog.categories
    .map((c) => {
      // Same filter + sort the category pages use, so the list order matches the UI.
      const items = sortIntegrations(
        catalog.integrations.filter((i) => i.categories.includes(c.id)),
      );
      if (items.length === 0) return null;
      const lines = items.map((i) => `- [${i.title}](${i.url}): ${i.tagline}`);
      return `## ${c.label}\n\n${lines.join("\n")}`;
    })
    .filter((s): s is string => s !== null);

  const body = `# ${catalog.meta.title}

> ${catalog.meta.tagline}

${catalog.meta.description}

## Resources

- [Website](${home}/): Browse all ${catalog.integrations.length} integrations.
- [GitHub](${catalog.meta.github}): Source for the Backblaze Labs projects.
- [JSON Feed](${home}/feed.json): Machine-readable catalog (JSON Feed 1.1).
- [Sitemap](${home}/sitemap.xml): All crawlable pages.

${sections.join("\n\n")}
`;

  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
};
