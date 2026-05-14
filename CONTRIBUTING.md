# Contributing to Backblaze Labs Website

Thanks for adding to the gallery! There are two kinds of contributions:

1. **Add or update an integration** — edit one JSON file. (Most contributions are this.)
2. **Improve the website** — components, styling, deploy, dev tooling.

---

## 1. Add or update an integration

The catalog lives in **[`src/data/labs.json`](src/data/labs.json)**. Add an object to the `integrations` array.

```json
{
  "id": "my-integration",
  "title": "My Integration",
  "tagline": "One-line pitch (under ~80 chars).",
  "description": "Two or three sentences explaining what it does and why it's useful.",
  "categories": ["ai-ml", "data-pipelines"],
  "type": "sdk",
  "language": "python",
  "tags": ["python", "ai", "vector-db"],
  "repo": "backblaze-labs/my-integration",
  "url": "https://github.com/backblaze-labs/my-integration",
  "preview": null,
  "icon": "flame",
  "accent": "red",
  "featured": false
}
```

## 1a. Adding an upstream integration

Sometimes our "integration" lives **inside someone else's project** — e.g. MLflow documents Backblaze B2 as a supported artifact store. Those are first-class entries in the catalog too. The shape is the same as a Labs entry, with two differences:

- Set `"repo": null` (no `backblaze-labs/...` repo to fetch stats for).
- Add `"source": "MLflow"` so the card footer shows where it lives.
- Use `"type": "integration"`.

Example:

```json
{
  "id": "mlflow",
  "title": "MLflow",
  "tagline": "Backblaze B2 as the MLflow artifact store.",
  "description": "MLflow's tracking server supports Backblaze B2 via the S3-compatible API…",
  "categories": ["ai-ml", "data-pipelines", "infra"],
  "type": "integration",
  "language": "python",
  "tags": ["mlflow", "mlops", "artifact-store"],
  "repo": null,
  "source": "MLflow",
  "url": "https://mlflow.org/docs/latest/self-hosting/architecture/artifact-store/#backblaze-b2",
  "featured": true
}
```

Upstream integration entries (with a `repo` field pointing at an external project) still surface that repo's stars in the card's star badge — the badge isn't tagged "upstream" because nothing about a third-party project's popularity changes the meaning of the count. If you want an upstream entry hidden from the stats UI entirely, set `repo: null`.

## Rules (both kinds)

- `id` must be `kebab-case` and unique.
- `categories`, `type`, and `language` must reference IDs already in the top-level `categories` / `types` / `languages` arrays. To introduce a new one, add it to that array first.
- `repo` is `owner/name` for first-party Labs projects, `null` for upstream integrations.
- `tagline` ≤ 80 chars. The card layout assumes it fits in two lines.
- `url` is **where users go when they click the card**. Default to the GitHub repo, but switch it to:
  - **VS Code Marketplace** for editor extensions once published (e.g. `https://marketplace.visualstudio.com/items?itemName=...`)
  - **PyPI** for Python packages (e.g. `https://pypi.org/project/jupyter-b2/`)
  - **npm** for JS packages
  - **The repo** for awesome-lists, samples, and anything else without a registry presence.
- `preview` is optional. Leave it unset and `scripts/sync-previews.mjs` will pick a preview from the upstream destination (preferring `<video>` heroes, then `<img>`, then `og:image`) or from the repo README for first-party items. To pin a specific image or video, set it to a fully-qualified URL like `https://cdn.example.com/hero.mp4` (image OR video — the card swaps to a `<video autoplay muted loop>` element automatically for `.mp4`/`.webm`/`.mov`/`.m4v` files). GitHub-generated OG cards (`opengraph.githubassets.com`) are deliberately rejected — they don't render well on the dark gallery background.
- `featured: true` pins the entry to the top of the gallery. Use sparingly. For tracker-managed entries, the `B2 Feature on website` label is the source of truth — adding/removing the label automatically toggles this on the next discovery run.

### Validate before pushing

```bash
npm run validate    # JSON schema check
npm run checks      # lint + format:check + typecheck + validate + docs:lint + spellcheck
```

Use the JSON schema in your editor for autocomplete:

```jsonc
// .vscode/settings.json
{
  "json.schemas": [
    { "fileMatch": ["src/data/labs.json"], "url": "./src/data/labs.schema.json" }
  ]
}
```

### The lazy way (recommended)

Most new integrations are picked up automatically by the **weekly discovery workflow**:

- New repos in `backblaze-labs/*` and `backblaze-b2-samples/*` → proposed automatically.
- Done items in the [upstream-integrations tracker](https://github.com/backblaze-labs/demand-side-ai/issues/5) → proposed automatically.

Every Monday, [`discover.yml`](.github/workflows/discover.yml) opens a PR with proposed entries. A maintainer polishes the tagline / description / categories and merges. You can run it locally:

```bash
npm run discover
npm run merge-discovered
```

If your project doesn't fit either source (e.g. it's an upstream integration without a tracker entry yet), submit it via the issue form below or open a PR with a `labs.json` entry directly.

### Submit via the issue form

Don't want to open a PR? Use the **[Add an integration](.github/ISSUE_TEMPLATE/add-integration.yml)** issue form. A maintainer will translate it to JSON.

---

## 2. Improve the website

```bash
conda activate node     # or: nvm use 24 — the project pins Node 24
npm install
npm run dev             # http://localhost:4321/website/
```

### Project layout

```text
src/
  components/    Astro components (Logo, Nav, Hero, Filters, Card, etc.)
  layouts/       BaseLayout.astro — head/meta, theme bootstrap, GA, Nav, Footer
  data/          labs.json (catalog) + labs.schema.json + github-stats.json
  lib/           labs.ts (typed loader) + schema.ts (JSON-LD generators)
  pages/         index, 404, category/[id], feed.json, og.png, sitemap.xml, robots.txt
  styles/        global.css — Tailwind v4 @theme tokens + utilities
public/
  brand/         official Backblaze logo SVGs
  previews/      hand-curated card preview images (optional)
  favicon.svg
.github/
  ISSUE_TEMPLATE/  structured forms for new integrations / bugs
  workflows/       ci.yml, deploy.yml, refresh-stats.yml, discover.yml
```

### Design tokens

Brand colors / fonts come from the official Backblaze brand kit. Don't introduce new ones without referencing the kit. The CSS variables in [`src/styles/global.css`](src/styles/global.css) under `@theme` are the single source of truth.

| Token | Hex | Usage |
| --- | --- | --- |
| `--color-red-50` | `#E20626` | Primary CTA, brand accent (the defining color) |
| `--color-navy-50` | `#000033` | Dark surface |
| `--color-purple-70` | `#3430FF` | Secondary accent (focus, links on light) |
| `--color-orange-50` | `#ED560D` | Used sparingly in gradients |

### Quality gate

CI runs `npm run checks` on every PR. It fails on:

- Lint warnings or errors (Biome, `--error-on-warnings`).
- Format diffs (Biome).
- Type errors (`astro check` under the stricter tsconfig — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.).
- Schema-invalid `labs.json` (ajv) or duplicate IDs / unknown category/type/language references.
- Markdownlint errors in any `.md` file.
- cspell flagging an unknown word — add it to `.cspell/project-words.txt` if it's a deliberate domain term.

Run `npm run fix` locally to auto-fix lint + format.

### Conventions

- Astro components for everything visual. Vanilla JS for islands (filter, theme).
- No client-side framework. Don't add React/Vue/Svelte deps without strong reason.
- Avoid hardcoded colors — use CSS variables so themes work.
- Avoid hardcoded `text-white` / `bg-white` — use `var(--fg)` / `var(--bg)`.
- All assets in `public/` with relative `${base}` paths so GitHub Pages base path works.

### Pull request checklist

- [ ] `npm run checks` passes locally.
- [ ] If adding an integration: `id` is unique, `repo` exists, `categories` / `type` / `language` are valid IDs.
- [ ] If touching styles: tested in **dark**, **light**, and **system** themes.
- [ ] If touching layout: tested at 375px (mobile), 768px (tablet), 1280px (desktop).

---

## License

By contributing you agree your contribution is licensed under the project's **MIT** license.
