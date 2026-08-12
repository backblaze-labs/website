import { catalog, type DetailedIntegration, type Integration, projectDetailPath } from "~/lib/labs";

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
  base = "",
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: pageUrl,
    numberOfItems: items.length,
    itemListElement: items.map((item, idx) => {
      // Collect every public URL the integration points at — search engines
      // use `sameAs` to canonicalize a single entity across multiple URLs
      // (repo, docs, marketing site, demo). The card UI only links the
      // primary `url`; the rest live in structured data so Google / Schema.org
      // consumers can still discover them.
      const detailPath = projectDetailPath(item, base);
      const itemUrl = detailPath ? new URL(detailPath, siteUrl).toString() : item.url;
      const sameAs = [
        item.url,
        item.site,
        item.docs,
        item.example,
        item.demo,
        item.repo ? `https://github.com/${item.repo}` : null,
      ].filter((u): u is string => Boolean(u) && u !== itemUrl);
      const uniqueSameAs = [...new Set(sameAs)];
      return {
        "@type": "ListItem",
        position: idx + 1,
        url: itemUrl,
        name: item.title,
        description: item.tagline,
        ...(uniqueSameAs.length > 0 ? { sameAs: uniqueSameAs } : {}),
      };
    }),
    // Pin the parent WebSite so Google groups items under our site.
    isPartOf: { "@type": "WebSite", url: siteUrl },
  };
}

export function softwareSourceCodeSchema(
  siteUrl: string,
  item: DetailedIntegration,
  pageUrl: string,
  imageUrls: string[],
  dateModified?: string,
) {
  const programmingLanguage = item.languages.map(
    (id) => catalog.languages.find((language) => language.id === id)?.label ?? id,
  );
  const codeRepository = item.repo ? `https://github.com/${item.repo}` : item.url;

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: item.title,
    description: item.detail.metaDescription,
    url: pageUrl,
    mainEntityOfPage: pageUrl,
    codeRepository,
    programmingLanguage,
    license: item.detail.license.url,
    audience: {
      "@type": "Audience",
      audienceType: item.detail.audience,
    },
    ...(imageUrls.length > 0 ? { image: imageUrls } : {}),
    keywords: item.tags.join(", "),
    author: {
      "@type": "Organization",
      name: SITE_NAME,
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: siteUrl,
    },
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: siteUrl,
    },
    ...(dateModified ? { dateModified } : {}),
  };
}
