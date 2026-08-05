import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const baseUrl = (site ?? new URL("https://backblazelabs.com")).toString().replace(/\/$/, "");
  const path = import.meta.env.BASE_URL.replace(/\/$/, "");
  const approvedRetrievalAgents = [
    "ChatGPT-User",
    "OAI-SearchBot",
    "Claude-SearchBot",
    "Claude-User",
    "PerplexityBot",
  ];
  const trainingCrawlers = ["GPTBot", "ClaudeBot", "anthropic-ai", "CCBot", "Google-Extended"];
  const body = [
    "# Approved search and user-triggered retrieval agents.",
    ...approvedRetrievalAgents.flatMap((agent) => [`User-agent: ${agent}`, "Allow: /", ""]),
    "# Training crawlers remain disallowed.",
    ...trainingCrawlers.flatMap((agent) => [`User-agent: ${agent}`, "Disallow: /", ""]),
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${baseUrl}${path}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain" } });
};
