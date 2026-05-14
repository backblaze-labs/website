# Development guide

For maintainers and folks hacking on the website itself. If you just want to **add an integration**, head to [`CONTRIBUTING.md`](./CONTRIBUTING.md) — it's a one-file edit.

## Stack at a glance

| | |
| --- | --- |
| Framework | [Astro 5](https://astro.build/) — static-first, ships ~0kb JS by default |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) with `@theme` brand tokens |
| Content | A single JSON file: [`src/data/labs.json`](src/data/labs.json) |
| Validation | [`ajv`](https://ajv.js.org/) + a JSON Schema, run via `npm run validate` |
| Type-check | `astro check` |
| Lint + format | [Biome 2](https://biomejs.dev/) |
| OG images | [Satori](https://github.com/vercel/satori) → SVG → [resvg](https://github.com/RazrFalcon/resvg) → PNG, generated at build time |
| Hosting | GitHub Pages, deployed via Actions |

## Environment

The project pins **Node 24**. Install however you like:

```bash
conda activate node          # what the maintainer uses
nvm use                      # honours .nvmrc
brew install node@24         # if you'd rather have it global
```

`.npmrc`, `.editorconfig`, `.nvmrc`, and `.node-version` are checked in so most editors and version managers self-configure.

## Common workflows

```bash
npm install
npm run dev          # http://localhost:4321/website/
npm run build        # → ./dist/
npm run preview      # serve the production build locally

npm run checks       # lint + format + typecheck + validate (what CI runs)
npm run fix          # auto-fix lint + format, then typecheck
npm run validate     # JSON schema check on labs.json only
npm run sync         # sync-stats + sync-links + sync-previews (one shot)
npm run sync-stats   # refresh src/data/github-stats.json from the GitHub API
npm run sync-previews # refresh src/data/previews.json (README + upstream og:image)
npm run sync-links   # refresh src/data/links.json (auto-derived site/docs/repo)
npm run discover     # scan source orgs + tracker for new integrations
npm run merge-discovered  # fold the discovery proposal into labs.json
```

`npm run sync` is a manual maintainer command. It's not wired into `dev`, `build`, or pre-commit — running it on every commit/dev-start is too noisy and depends on `gh` auth + network. The CI workflows ([`refresh-stats.yml`](.github/workflows/refresh-stats.yml), [`discover.yml`](.github/workflows/discover.yml)) keep `main` fresh; run `sync` locally when you want the latest data on your branch.

### Discovery workflow

The catalog grows by **discovery from upstream metadata**, not hand-typing. The contract for what to put on each upstream source lives in [`CONVENTIONS.md`](./CONVENTIONS.md).

**Sources:**

- `backblaze-labs/*` — every public, non-archived repo
- `backblaze-b2-samples/*` — every public, non-archived repo
- Tier-1 tracking issues — currently just [`backblaze-labs/demand-side-ai#5`](https://github.com/backblaze-labs/demand-side-ai/issues/5) (closed sub-issues / `[x]` task-list items become cards). Add more by appending to `TRACKERS` in [`scripts/discover.mjs`](scripts/discover.mjs).

### Run discovery locally

```bash
# 1. Make sure gh CLI is authenticated
gh auth status                       # if not: gh auth login

# 2. Run discovery — writes src/data/labs.discovered.json (gitignored)
npm run discover

# 3. Inspect what it proposed
cat src/data/labs.discovered.json | jq .

# 4. Either fix the upstream metadata (see CONVENTIONS.md) and re-run discover,
#    or merge as-is and polish locally:
npm run merge-discovered             # appends new entries, removes staging file
git diff src/data/labs.json          # review the additions
npm run validate
npm run sync-stats                   # refresh stars/forks for the new repos

# 5. Build + preview to see them in the gallery
npm run build && npm run preview
```

The script never deletes — it only proposes additions and warns about stale entries (catalog has them, source orgs don't).

### To bypass the tracker (offline / no PAT)

Discovery skips any tracker that gh can't read. To run locally without a PAT for the private `demand-side-ai`, comment out the `TRACKERS` entry in `discover.mjs` — public-org listings still work.

The pipeline:

```text
backblaze-labs/*                ┐
backblaze-b2-samples/*          ├──► discover.mjs ──► labs.discovered.json
demand-side-ai#5 (done items)   ┘                           │
                                                            ▼ human review
                                                    merge-discovered.mjs
                                                            │
                                                            ▼
                                                       labs.json
```

Each entry is tagged `_complete` (auto-mergeable, all metadata from upstream) or `_incomplete` (has TODO placeholders, needs upstream fix).

```bash
npm run discover            # writes src/data/labs.discovered.json (gitignored)
npm run merge-discovered    # appends new entries to labs.json, removes staging file
npm run validate
npm run sync-stats          # refreshes github-stats.json for new repos
```

### CI automations

| Workflow | Cadence | Behaviour |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | every PR + non-main push | Runs `npm run checks` + a build smoke-test. Gates merges to `main`. |
| [`deploy.yml`](.github/workflows/deploy.yml) | on push to `main` | Builds the site and publishes to GitHub Pages. |
| [`refresh-stats.yml`](.github/workflows/refresh-stats.yml) | daily 07:00 UTC | Refreshes `github-stats.json` and **commits straight to `main`** — no PR. Stats are low-risk numeric data. |
| [`discover.yml`](.github/workflows/discover.yml) | weekly, Mon 08:00 UTC | Runs discovery + always opens a **PR**. Body lists "ready" vs "need upstream fix" entries. Never auto-merged. |

To access the private `demand-side-ai` tracker on CI, set a `LABS_DISCOVERY_PAT` repo secret (a fine-grained PAT with read access). Without it, public-org listings still work; the tracker is silently skipped.

To attribute auto-commits to a dedicated bot account (e.g. `backblaze-b2-bot`) instead of `github-actions[bot]`, set repo variables `BOT_NAME` and `BOT_EMAIL`. Both workflows pick them up automatically.

The discovery script never deletes — it only proposes additions and warns about stale entries.

A pre-commit hook (`simple-git-hooks`) runs `npm run checks` before every commit so lint/format/typecheck/validate/docs regressions can't slip through.

## Project layout

```text
src/
├── components/         Astro components — Logo, Nav, Hero, Filters, Card, Footer, Icon, ThemeSwitcher, PreviewPlaceholder, Analytics
├── layouts/
│   └── BaseLayout.astro    head/meta, theme bootstrap, GA, Nav, Footer
├── data/
│   ├── labs.json           the catalog
│   ├── labs.schema.json    JSON Schema for labs.json — wire into your editor
│   └── github-stats.json   stars/forks/last-push, refreshed by `npm run sync-stats`
├── lib/
│   ├── labs.ts            typed loader: catalog, statsFor(id), previewUrl(item)
│   └── schema.ts          Schema.org JSON-LD generators (Organization / WebSite / ItemList)
├── pages/
│   ├── index.astro            landing page (Hero + Gallery)
│   ├── 404.astro
│   ├── category/[id].astro    category landing pages
│   ├── og.png.ts              site-wide Open Graph image (Satori → resvg → PNG)
│   ├── feed.json.ts           JSON Feed 1.1 syndication endpoint
│   ├── sitemap.xml.ts         single-file sitemap
│   └── robots.txt.ts
└── styles/
    └── global.css         Tailwind v4 @theme tokens + utilities + theme branches

public/
├── brand/              official Backblaze logo SVGs (do not edit)
├── previews/           hand-curated card preview images, optional (referenced by labs.json `preview` field)
└── favicon.svg

scripts/
├── validate.mjs           JSON-schema-validates labs.json + cross-field rules
├── sync.mjs               runs sync-stats / sync-links / sync-previews in parallel
├── sync-stats.mjs         fetches GitHub repo stats via the gh CLI (diff-aware)
├── sync-links.mjs         auto-discovers site/docs/demo URLs per integration
├── sync-previews.mjs      auto-discovers hero image/video URLs (HEAD-verified)
├── _http.mjs              shared HTTP scraping primitives (UA, fetcher, entity decode)
├── discover.mjs           scans source orgs + tracker for new integrations
├── merge-discovered.mjs   folds the discovery proposal into labs.json + reconciles featured
├── tag-repos.mjs          one-time bootstrap: adds `b2-labs` topic to every org repo
└── seed-tracker.mjs       seeds tier-1 tracker sub-issues from a CSV

.github/
├── ISSUE_TEMPLATE/     structured forms (add-integration.yml, bug.yml, config.yml)
├── PULL_REQUEST_TEMPLATE.md
├── CODEOWNERS
├── dependabot.yml
└── workflows/
    ├── ci.yml             lint + format + typecheck + validate on every PR
    ├── deploy.yml         deploys to GitHub Pages on push to main
    ├── discover.yml       weekly cron — opens a PR with new discovery proposals
    └── refresh-stats.yml  nightly cron — refreshes github-stats.json
```

## Design tokens

All brand colors and font tokens live in [`src/styles/global.css`](src/styles/global.css) under `@theme`. Don't introduce new ones without referencing the Backblaze Brand Guidelines.

| Variable | Hex | Usage |
| --- | --- | --- |
| `--color-red-50` | `#E20626` | The defining color. CTAs, accents, focus rings. |
| `--color-navy-50` | `#000033` | Dark surface. |
| `--color-purple-70` | `#3430FF` | Modern secondary accent. |
| `--color-orange-50` | `#ED560D` | Used sparingly in gradients. |

All visual treatments are also driven by tokens (`--bg`, `--bg-card`, `--fg`, `--fg-muted`, `--border`, etc.) that adapt to dark/light/system theme. **Never hardcode `text-white` / `bg-white`** — use the tokens so themes work.

## Theme

Tri-mode switcher (dark / system / light). State lives on `<html data-theme="…">`, persisted to `localStorage["bb-theme"]`. Default is `system`. A pre-paint inline script in [`BaseLayout.astro`](src/layouts/BaseLayout.astro) sets the attribute before first paint to avoid FOUC.

To add a new theme-aware token:

1. Define a default in `:root, [data-theme="dark"]`.
2. Override in `[data-theme="light"]`.
3. Mirror the override in the `@media (prefers-color-scheme: light) { [data-theme="system"] { … } }` block.

The PreviewPlaceholder SVG is the canonical example — see `--placeholder-*` vars in `global.css`.

## Adding a page

Drop an `.astro` file in `src/pages/`. The route mirrors the path. Use `BaseLayout` for consistent nav/footer/theme/GA wiring.

```astro
---
import BaseLayout from "~/layouts/BaseLayout.astro";
---
<BaseLayout title="My new page">
  <h1>Hello</h1>
</BaseLayout>
```

## OG images

[`src/pages/og.png.ts`](src/pages/og.png.ts) generates a single 1200×630 PNG used as the site-wide `og:image` / `twitter:image` (set in `BaseLayout.astro`). One image for the whole site — we don't generate per-page variants since cards link straight to upstream and there are no per-integration pages.

To customize:

- Brand colors and the layout are inline in the route handler.
- Fonts are loaded from `@fontsource/space-grotesk` and `@fontsource/dm-sans`.
- Re-run `npm run build` to regenerate.

## Schema-validated catalog

`src/data/labs.schema.json` is referenced from `labs.json`'s `$schema` key, so editors with JSON Schema support get live autocomplete + diagnostics. The `.vscode/settings.json` in this repo binds it explicitly for VS Code.

`scripts/validate.mjs` enforces:

- Schema-level constraints from `labs.schema.json`.
- Cross-field constraints not expressible in JSON Schema (every `categories[]` ID must exist in the top-level `categories`; same for `type` and `language`; `id` must be unique).

## Deploy

Push to `main` → [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs `npm ci`, then `npm run checks`, then `astro build`, then deploys `dist/` to GitHub Pages.

In repo **Settings → Pages**, source must be **GitHub Actions**.

To set `PUBLIC_GA_ID` for production analytics, add it as a repo secret. The workflow injects it at build time.

### Custom domain

When you wire a custom domain (e.g. `labs.backblaze.com`):

1. Add a `public/CNAME` file with the domain.
2. In `astro.config.mjs`, change `site` to the domain and remove `base`.
3. Configure DNS (CNAME → `<org>.github.io`).

## Troubleshooting

**"Cannot find module 'node:fs'"** — ensure `@types/node` is installed (`npm install`).

**Astro complains about Vite plugin types** — Astro 5 bundles its own Vite. The plugin from `@tailwindcss/vite` is structurally compatible but its `Plugin` type comes from a different copy. The cast `/** @type {any} */ (tailwindcss())` in `astro.config.mjs` silences the false positive.

**Images not loading on GitHub Pages** — make sure asset paths use `import.meta.env.BASE_URL` so the `/website` base path is honored.

**`npm run sync-stats` fails** — the `gh` CLI must be authenticated. Run `gh auth status` to confirm, or set `GH_TOKEN` / `GITHUB_TOKEN`.
