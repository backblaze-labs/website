# Backblaze Labs Website

The landing page for [Backblaze Labs](https://github.com/backblaze-labs) — a curated gallery of open source experiments, integrations, and tools built on Backblaze B2.

Inspired by [vercel.com/templates](https://vercel.com/templates).

## Stack

- **[Astro 5](https://astro.build/)** — static-first, ships ~0kb JS by default.
- **[Tailwind CSS v4](https://tailwindcss.com/)** — `@theme`-driven brand tokens.
- **MDX** — for future long-form content.
- **GitHub Pages** — deploys via the workflow in `.github/workflows/deploy.yml`.

## Adding an integration

**Most of the time, you don't edit this repo.** The catalog auto-discovers from `backblaze-labs/*`, `backblaze-b2-samples/*`, and the upstream tracker every Monday. Set the right metadata on the upstream source and your card appears automatically. See [`CONVENTIONS.md`](./CONVENTIONS.md) for the full contract.

If your integration doesn't fit any of those sources, fall back to hand-editing the JSON:

## Manual entry (fallback)

The catalog is a **single JSON file** at [`src/data/labs.json`](src/data/labs.json). Add an entry, push, and CI deploys.

```json
{
  "id": "your-project",
  "title": "Your Project",
  "tagline": "One-line pitch (under ~80 chars).",
  "description": "Two or three sentences explaining what it does and why it's useful.",
  "categories": ["ai-ml", "data-pipelines"],
  "type": "sdk",
  "language": "python",
  "tags": ["python", "ai"],
  "repo": "backblaze-labs/your-project",
  "url": "https://github.com/backblaze-labs/your-project",
  "icon": "flame",
  "accent": "red",
  "featured": false
}
```

Available `categories`, `types`, and `languages` are enumerated at the top of `labs.json`. Add new ones to those lists if needed.

A JSON Schema is published alongside at [`src/data/labs.schema.json`](src/data/labs.schema.json) — point your editor at it for autocomplete + validation.

## Local development

This project pins **Node 24**. The conda env on the maintainer's machine is named `node`:

```bash
# Use whatever Node 24 install you prefer:
conda activate node
# or: nvm use 24
# or: brew install node@24

npm install
npm run dev      # → http://localhost:4321/website/
npm run build    # → ./dist/
npm run preview  # serve the production build locally
```

## Quality checks

A single command runs everything CI runs:

```bash
npm run checks   # lint + format + typecheck + JSON-schema validate
npm run fix      # auto-fix lint + format, then typecheck + validate
```

| Script | What it does |
| --- | --- |
| `npm run lint`     | Biome lint (no fixes). |
| `npm run lint:fix` | Biome lint with `--write`. |
| `npm run format`   | Biome format check. |
| `npm run format:fix` | Biome format with `--write`. |
| `npm run typecheck` | `astro check` (TS + Astro diagnostics). |
| `npm run validate` | JSON-schema-validates `labs.json`. |
| `npm run checks`   | All of the above, fail-fast. |
| `npm run fix`      | `biome check --write` + typecheck + validate. |
| `npm run discover` | Scan source orgs + tracker for new integrations (writes a staging file). |
| `npm run merge-discovered` | Fold the discovery proposal into `labs.json`. |
| `npm run sync-stats` | Refresh `github-stats.json` from the GitHub API. |

## Brand

Colors and fonts come from the official Backblaze brand kit. Token names mirror the brand kit's tint scale (Red 50 = `#E20626`, Navy 50 = `#000033`, etc.).

| Token | Hex | Usage |
| --- | --- | --- |
| `--color-red-50` | `#E20626` | Defining color — CTAs, brand accent |
| `--color-navy-50` | `#000033` | Dark surface / primary text on light |
| `--color-purple-70` | `#3430FF` | Secondary accent |
| `--color-orange-50` | `#ED560D` | Used sparingly in gradients |
| `--color-beige-10` | `#FAF9F8` | Light theme background |

Display font: **Space Grotesk**. Body font: **DM Sans**.

## Analytics

Both **Google Analytics 4** (direct) and **Google Tag Manager** are supported, via env vars. Set either (or both); with nothing set, no telemetry is loaded.

### Configuration

Copy `.env.example` to `.env` and fill what you want:

```bash
PUBLIC_GA_ID=G-XXXXXXXXXX        # GA4 measurement ID
PUBLIC_GA_DEBUG=                 # "true" enables GA4 DebugView (non-prod only)
PUBLIC_GTM_ID=GTM-XXXXXXX        # GTM container ID — independent of GA4
```

For production, add the IDs as **repository secrets** and they flow through to the build via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The build picks them up at build time and bakes them into the static HTML; no runtime config endpoint needed.

### Events being tracked

The [`<Analytics />`](src/components/Analytics.astro) component installs a small `window.bbTrack(name, params)` helper plus a delegated click listener. Events are forwarded to **both** GA4 (via `gtag`) and the GTM `dataLayer`, so a GTM container can fan them out to other destinations (Mixpanel, Plausible, etc.) without code changes.

| Event | Fires when | Params |
| --- | --- | --- |
| `card_click` | A gallery card is clicked | `id`, `type`, `language`, `source` (`labs` / `upstream`) |
| `cta_click` | A CTA button is clicked (Try B2, Browse, Hero GitHub, etc.) | `cta` |
| `theme_change` | Theme switcher button is pressed | `theme` (`light` / `system` / `dark`) |
| `filter_change` | A category / type / language filter checkbox toggles on | `filter` (`category` / `type` / `language`), `value` |
| `search` | Gallery search input changes (debounced 700ms, min 2 chars) | `search_term` (capped at 80 chars) |
| `outbound_click` | Any external link (`<a target="_blank">`) is clicked | `host`, `url`, `text` |
| `page_view` | Pageview (auto, GA4 default) | (auto) |

### Adding new events

Drop a `data-track` attribute on any element. Extra params come from `data-track-*` attributes, kebab-cased into snake_case at fire time:

```html
<button data-track="signup_open" data-track-source="footer">Sign up</button>
<!-- fires: bbTrack("signup_open", { source: "footer" }) -->
```

No JS wiring needed — the delegated click handler in `Analytics.astro` picks it up.

## Theme

Tri-mode switcher (dark / system / light), persisted in `localStorage` under `bb-theme`. Default is `system`. Pre-paint inline script avoids FOUC.

## Deploying

Pushes to `main` deploy to GitHub Pages via Actions. In repo **Settings → Pages**, set the source to **GitHub Actions**.

If you wire a custom domain later (e.g. `labs.backblaze.com`):

1. Add a `public/CNAME` file with the domain.
2. In `astro.config.mjs`, change `site` to the domain and remove `base`.
3. Configure DNS (CNAME → `<org>.github.io`).

## License

Code: MIT. Brand assets: © Backblaze, Inc. Used per the brand kit guidelines.

