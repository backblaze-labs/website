import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { Resvg } from "@resvg/resvg-js";
import type { APIRoute } from "astro";
import satori from "satori";
import { catalog } from "~/lib/labs";

/**
 * Site-wide Open Graph image — a single PNG at /og.png used for every page's og:image.
 *
 * We don't generate per-page OG images: the site is a single gallery, and detail
 * pages were dropped (cards link straight to the upstream destination), so a single
 * "Backblaze Labs" image is the right scope.
 */

const here = path.dirname(url.fileURLToPath(import.meta.url));
const fontDir = path.resolve(here, "../../node_modules");

function loadFontMaybe(...candidates: string[]): Buffer | null {
  for (const c of candidates) {
    try {
      const full = path.join(fontDir, c);
      if (fs.existsSync(full)) return fs.readFileSync(full);
    } catch {}
  }
  return null;
}

const fontRegular = loadFontMaybe("@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff");
const fontBold = loadFontMaybe(
  "@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff",
);

// Embed the actual brand flame as a base64 data URL — Satori's <img> can load it
// without a network round-trip and without depending on a public asset URL.
const flameSvgPath = path.resolve(here, "../../public/brand/flame-red.svg");
const flameDataUrl = (() => {
  try {
    const svg = fs.readFileSync(flameSvgPath);
    return `data:image/svg+xml;base64,${svg.toString("base64")}`;
  } catch {
    return null;
  }
})();

export const GET: APIRoute = async () => {
  const fonts: Parameters<typeof satori>[1]["fonts"] = [];
  if (fontRegular) fonts.push({ name: "Body", data: fontRegular, weight: 400, style: "normal" });
  if (fontBold) fonts.push({ name: "Display", data: fontBold, weight: 700, style: "normal" });

  const tree = {
    type: "div",
    props: {
      style: {
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "60px",
        background: "#000033",
        backgroundImage:
          "radial-gradient(ellipse 80% 60% at 80% 10%, rgba(52,48,255,0.45), transparent 65%), radial-gradient(ellipse 70% 50% at 15% 5%, rgba(226,6,38,0.55), transparent 65%), radial-gradient(ellipse 50% 40% at 50% 110%, rgba(237,86,13,0.35), transparent 65%)",
        color: "white",
        fontFamily: "Display, Body, sans-serif",
      },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", gap: "16px" },
            children: [
              flameDataUrl
                ? {
                    type: "img",
                    props: {
                      src: flameDataUrl,
                      width: 44,
                      height: 72,
                      style: { display: "block" },
                    },
                  }
                : {
                    type: "div",
                    props: { style: { width: "44px", height: "72px" } },
                  },
              {
                type: "div",
                props: {
                  style: {
                    fontSize: "28px",
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    display: "flex",
                    gap: "8px",
                  },
                  children: [
                    { type: "span", props: { children: "Backblaze" } },
                    { type: "span", props: { style: { color: "#E20626" }, children: "Labs" } },
                  ],
                },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: "16px" },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    fontSize: "76px",
                    fontWeight: 700,
                    lineHeight: 1.05,
                    letterSpacing: "-0.025em",
                    maxWidth: "1000px",
                  },
                  children: catalog.meta.title,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    fontSize: "30px",
                    color: "rgba(255,255,255,0.78)",
                    maxWidth: "1000px",
                    lineHeight: 1.3,
                  },
                  children: catalog.meta.tagline,
                },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "22px",
              color: "rgba(255,255,255,0.66)",
            },
            children: [
              { type: "div", props: { children: "github.com/backblaze-labs" } },
              {
                type: "div",
                props: { children: `${catalog.integrations.length} open source projects` },
              },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(tree as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts,
  });

  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();

  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
  });
};
