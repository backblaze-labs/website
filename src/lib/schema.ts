import { catalog, type Integration } from "~/lib/labs";

/**
 * Schema.org JSON-LD generators. Output is consumed by `BaseLayout.astro`
 * via a `<script type="application/ld+json">` tag.
 *
 * We emit three documents per page:
 *   1. Organization — represents Backblaze Labs (sub-org of Backblaze, Inc.)
 *   2. WebSite     — site name, description, plus a `SearchAction` so Google
 *                    can wire a sitelinks searchbox (`?q=...` lands on the
 *                    homepage with the search input pre-populated; see
 *                    Gallery.astro).
 *   3. ItemList    — optional, supplied by the page. The homepage emits one
 *                    over the full catalog; category pages emit one over
 *                    their filtered slice.
 */

const SITE_NAME = "Backblaze Labs";

export function organizationSchema(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: siteUrl,
    logo: `${siteUrl}/brand/flame-red.svg`,
    description: catalog.meta.tagline,
    sameAs: [catalog.meta.github, catalog.meta.homepage].filter(Boolean),
    parentOrganization: {
      "@type": "Organization",
      name: "Backblaze, Inc.",
      url: catalog.meta.homepage ?? "https://www.backblaze.com",
    },
  };
}

export function websiteSchema(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: siteUrl,
    description: catalog.meta.description,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function itemListSchema(
  siteUrl: string,
  name: string,
  items: Integration[],
  pageUrl: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: pageUrl,
    numberOfItems: items.length,
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: item.url,
      name: item.title,
      description: item.tagline,
    })),
    // Pin the parent WebSite so Google groups items under our site.
    isPartOf: { "@type": "WebSite", url: siteUrl },
  };
}
