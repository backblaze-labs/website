// @ts-check

import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Backblaze Labs site — deployed to GitHub Pages.
// Custom-domain-ready: when a CNAME is added, swap `site` and clear `base`.
//
// Sitemap is hand-rolled in src/pages/sitemap.xml.ts so we get a single file
// instead of @astrojs/sitemap's index-of-shards pattern (which is overkill for
// our ~40-URL footprint).
export default defineConfig({
  site: "https://backblaze-labs.github.io",
  base: "/website",
  trailingSlash: "ignore",
  integrations: [mdx()],
  vite: {
    // Cast: Astro bundles its own Vite copy, so its `Plugin` type identity differs from
    // @tailwindcss/vite's. The plugin is structurally compatible — works fine at runtime.
    plugins: [/** @type {any} */ (tailwindcss())],
  },
  build: {
    assets: "_assets",
    // Always inline our stylesheets — the bundle is small (~7-10KB) and a
    // network round-trip costs more than the inlined bytes. Eliminates the
    // render-blocking CSS request Lighthouse flags on desktop.
    inlineStylesheets: "always",
  },
});
