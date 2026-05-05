import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const baseUrl = (site ?? new URL("https://backblaze-labs.github.io"))
    .toString()
    .replace(/\/$/, "");
  const path = import.meta.env.BASE_URL.replace(/\/$/, "");
  const body = `User-agent: *
Allow: /

Sitemap: ${baseUrl}${path}/sitemap.xml
`;
  return new Response(body, { headers: { "content-type": "text/plain" } });
};
