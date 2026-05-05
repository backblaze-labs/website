import type { APIRoute } from "astro";
import { catalog } from "~/lib/labs";

/**
 * Single-file sitemap. We control every URL on this site (it's all derivable
 * from labs.json), so an index-of-shards pattern adds no value.
 *
 * Excludes /og/*.png — those are images, not pages. Sitemaps are for crawlable docs.
 */
export const GET: APIRoute = ({ site }) => {
  const baseUrl = (site ?? new URL("https://backblaze-labs.github.io"))
    .toString()
    .replace(/\/$/, "");
  const path = import.meta.env.BASE_URL.replace(/\/$/, "");
  const today = new Date().toISOString().slice(0, 10);

  // No per-integration URLs — cards link straight to the upstream destination.
  // The gallery and category pages are the only crawlable pages we own.
  const urls: { loc: string; lastmod: string; priority?: string; changefreq?: string }[] = [
    { loc: `${baseUrl}${path}/`, lastmod: today, priority: "1.0", changefreq: "weekly" },
  ];

  for (const c of catalog.categories) {
    urls.push({
      loc: `${baseUrl}${path}/category/${c.id}`,
      lastmod: today,
      priority: "0.7",
      changefreq: "weekly",
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>${u.changefreq ? `\n    <changefreq>${u.changefreq}</changefreq>` : ""}${u.priority ? `\n    <priority>${u.priority}</priority>` : ""}
  </url>`,
  )
  .join("\n")}
</urlset>
`;

  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
