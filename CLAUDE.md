# CLAUDE.md

Guidance for agents working in this repo. This is the Backblaze Labs website: an
Astro static site for the open source projects catalog, deployed to GitHub Pages.

## Commands

- `npm run dev` starts the local dev server.
- `npm run checks` runs lint, format check, typecheck, and JSON-schema validate. Run it before every push.
- `npm run build` is the production build and doubles as the CI smoke test.
- `npm run sync-previews`, `sync-stats`, `discover`, `merge-discovered` are the catalog data sync scripts.

## CI and workflows (`.github/workflows/`)

- `ci.yml` is the only pull-request-triggered workflow (lint, format, typecheck, validate, build smoke).
- **Dependabot PRs never run CI, ever.** The `checks` job is gated on both `github.actor` and `github.event.pull_request.user.login` being non-dependabot, so a dependabot PR stays skipped even when a human re-runs it, and the `push` trigger ignores `dependabot/**` branches. Dependabot updates are reviewed and merged manually.
- **Any new workflow that triggers on `pull_request` or `pull_request_target` MUST replicate that dependabot guard on every job**, or dependabot PRs will start spending CI minutes again.
- `deploy.yml` runs only on push to `main`. `discover.yml`, `refresh-stats.yml`, and `retrieval-agent-probe.yml` run on a schedule or manual dispatch. None are triggered by pull requests.

## Generated data

The JSON files in `src/data/` (`labs.json`, `github-stats.json`, `links.json`, `previews.json`, `preview-sources.json`, `labs.discovered.json`) are produced by the sync and discover scripts and refreshed by scheduled workflows. `labs.json` is the catalog; treat the rest as generated output. They are excluded from spellcheck.

## Conventions

- Catalog metadata is sourced upstream (repo topics and description, or a tracker sub-issue meta block). See `CONVENTIONS.md`.
- Match the existing comment style and keep changes tightly scoped. Contributor setup lives in `CONTRIBUTING.md`.
