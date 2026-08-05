import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const baseUrl = (site ?? new URL("https://backblazelabs.com")).toString().replace(/\/$/, "");
  const path = import.meta.env.BASE_URL.replace(/\/$/, "");
  const body = [
    "# Public discoverability catalog — every crawler is welcome, including AI search,",
    "# user-triggered retrieval, and training crawlers. We want this content both fetchable",
    "# by retrieval agents and represented in AI training data.",
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${baseUrl}${path}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain" } });
};
