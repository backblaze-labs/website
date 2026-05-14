/**
 * Shared HTTP scraping primitives for the discovery + sync scripts.
 *
 * Why this module exists: previously `discover.mjs`, `sync-links.mjs`, and
 * `sync-previews.mjs` each carried their own `fetch` wrapper. They drifted
 * apart — different user agents, different timeouts, only one of them did
 * HTML-entity decoding on extracted URLs. The result was silent breakage on
 * Webflow / Cloudflare-fronted upstream sites that block bot UAs, and
 * `&amp;`-encoded URLs leaking into JSON for the scrapers without the decode.
 *
 * The helpers here are the LOWEST common denominator: realistic UA,
 * entity-aware URL absolutization, bounded streaming HTML reader. Each
 * script's per-domain parsing logic (img/video/og extraction, link
 * inference, etc.) stays in that script — only the I/O primitives are shared.
 *
 * @module scripts/_http
 */

/**
 * Realistic browser User-Agent string sent on every outbound HTTP request from
 * sync/discover scripts. Some hosts (Webflow CDNs, Cloudflare-protected
 * marketing sites like `cvat.ai`) return interstitial HTML or 4xx when hit
 * with bot-shaped UAs — they only serve real content to UAs that look like a
 * Chromium/Firefox/Safari browser. Using a consistent realistic UA across all
 * scripts means we get the same HTML a human visitor sees.
 */
export const FETCH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";

/**
 * Decode the most common HTML entity references back to literal characters.
 *
 * URLs scraped from HTML attributes keep their entity-escaping (e.g.
 * `?a=1&amp;b=2` for a `?a=1&b=2` query string). Without decoding, those URLs
 * either fail when re-fetched (`&amp;` isn't a real query separator) or get
 * double-encoded when Astro's templating re-escapes them on the way to
 * rendered HTML, producing broken `<img src>` values like
 * `?a=1&amp;amp;b=2`.
 *
 * Covers the entities that actually appear in scraped HTML — not a full HTML
 * entity table.
 *
 * @param s - Raw attribute value extracted from HTML, or null/undefined.
 * @returns The decoded string, or the input unchanged when given null/undefined.
 */
export function decodeHtmlEntities(s) {
  if (s == null) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number.parseInt(d, 10)));
}

/**
 * Resolve a possibly-relative URL against the page it was extracted from.
 *
 * Handles the four shapes a URL can take in an HTML attribute:
 *   - `https://example.com/path`          — already absolute, returned as-is.
 *   - `//example.com/path`                — protocol-relative, defaults to https.
 *   - `/path/to/asset.png`                — root-relative, prepended with base host.
 *   - `path/to/asset.png` or `./path/...` — relative to the base page URL.
 *
 * Entity-decodes the input before parsing, so callers don't need to remember
 * to call {@link decodeHtmlEntities} first.
 *
 * @param maybeRelative - The `src` / `href` value pulled from HTML, possibly
 *                       entity-escaped, possibly null.
 * @param basePageUrl   - The URL of the page the attribute came from.
 * @returns A fully-qualified absolute URL, or null when the input can't be
 *          resolved (empty string, unparseable URL, etc.).
 */
export function absoluteUrl(maybeRelative, basePageUrl) {
  const raw = decodeHtmlEntities((maybeRelative ?? "").trim());
  if (!raw) return null;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (/^https?:\/\//.test(raw)) return raw;
  if (raw.startsWith("data:")) return raw;
  try {
    if (raw.startsWith("/")) {
      const u = new URL(basePageUrl);
      return `${u.protocol}//${u.host}${raw}`;
    }
    return new URL(raw, basePageUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Fetch a page's HTML up to a size cap. Streams the body so we can stop early
 * for `<head>`-only scrapers and avoid downloading megabytes of body content
 * we'd discard anyway.
 *
 * @param targetUrl - The URL to fetch.
 * @param options.maxBytes  - Max bytes to read from the body. Defaults to 1 MB,
 *                            enough to walk through `<head>` and the first
 *                            screen of `<body>` images on modern sites.
 * @param options.timeoutMs - Abort timer in milliseconds. Defaults to 8 s,
 *                            which is long enough for slow CDNs but short
 *                            enough that the parallel-sync flow stays snappy.
 * @param options.stopAtHeadEnd - When true, stop reading as soon as
 *                                `</head>` is seen. Useful for scrapers that
 *                                only need meta tags / canonical links.
 * @returns The HTML body as a string, or null when the response was non-OK,
 *          non-HTML, network-failed, or timed out.
 */
export async function fetchHtml(
  targetUrl,
  { maxBytes = 1024 * 1024, timeoutMs = 8000, stopAtHeadEnd = false } = {},
) {
  if (!targetUrl) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(targetUrl, {
      signal: ctl.signal,
      redirect: "follow",
      headers: {
        "user-agent": FETCH_UA,
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("html")) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    let bytes = 0;
    let html = "";
    const dec = new TextDecoder();
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += dec.decode(value, { stream: true });
      if (stopAtHeadEnd && (html.includes("</head>") || html.includes("</HEAD>"))) break;
    }
    try {
      reader.cancel();
    } catch {}
    return html;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
