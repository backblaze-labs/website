# AGENTS.md

Canonical agent and contributor guidance for the Backblaze Labs website: an Astro
static site for the open source projects catalog, deployed to GitHub Pages. Codex
reads this file natively and `CLAUDE.md` imports it, so the guidance stays
identical for both and cannot drift.

## Commands

- `npm run dev` starts the local dev server.
- `npm run checks` runs lint, format check, typecheck and JSON-schema validate.
- `npm run build` is the production build and the CI smoke test.
- `npm run ci` is the local mirror of the `ci.yml` PR jobs (checks, then build). Run it before pushing.
- `npm run sync`, `sync-stats`, `sync-previews`, `sync-links`, `discover`, `merge-discovered` are the catalog data sync scripts.
- `npm run changelog` adds a changelog fragment (`changie new`).
- `npm run review:metrics` reports human review time and reverts for recent merged PRs.

## CI and workflows (`.github/workflows/`)

- `ci.yml` (lint, format, typecheck, validate, build smoke) is the only pull-request-triggered workflow.
- **Dependabot PRs never run CI.** The `checks` job is gated on both `github.actor` and `github.event.pull_request.user.login` being non-dependabot, and the `push` trigger ignores `dependabot/**`. **Any new workflow that triggers on `pull_request` MUST replicate that guard on every job**, or dependabot PRs start spending CI minutes.
- `changelog.yml` enforces a changie fragment on PRs (same guard). `deploy.yml` runs only on push to `main`; `discover.yml`, `refresh-stats.yml` and `retrieval-agent-probe.yml` are schedule or manual only.

## Generated data

The JSON files in `src/data/` (`labs.json`, `github-stats.json`, `links.json`, `previews.json`, `preview-sources.json`, `labs.discovered.json`) are produced by the sync and discover scripts. `labs.json` is the catalog, the only one edited by hand and only to the schema (`npm run validate`); treat the rest as generated output. Catalog metadata is sourced upstream (repo topics and description, or a tracker sub-issue meta block); see `CONVENTIONS.md`.

## How changes flow

Larger changes follow the AI-native SDLC in [`docs/SDLC.md`](docs/SDLC.md): `intent/<slug>/intent.md` to `spec.md` to `plan.md`, then code. Templates live in `intent/`, and the playbook skills in `.claude/skills/` (start with `ai-native-sdlc`). Small fixes, catalog edits and dependency updates go straight to code with the issue as the record. A human accepts each artifact; never mark one approved on their behalf.

## Things agents get wrong

The full list, with examples, is [`docs/review-lessons.md`](docs/review-lessons.md). Read it before writing code. The most frequent:

- A new `pull_request` workflow without the Dependabot CI guard.
- Hand-editing generated data (`github-stats.json`, `links.json`, `previews.json`, `preview-sources.json`); only `labs.json` is edited by hand, and the sync scripts overwrite the rest.
- Catalog entries added without sourcing metadata upstream, or with a dead `url` or preview.
- Internal links that drop the Astro `base` path, so they 404 on GitHub Pages.
- Docs or UI copy that claims more than the code does; PR descriptions that drift from the final diff.

## Verifying your work

- Run `npm run ci` before pushing (checks, then build smoke). If a check fails, fix the code, not the check; never loosen a check to go green.
- For a visual change, view it at mobile and desktop widths in dark, light and system themes.
- Claude Code hooks in `.claude/settings.json` run Biome on edited files and ask before edits to generated data, workflow and release files. CI and `CODEOWNERS` remain the gates.

## Opening a PR

- The person directing the agent owns the PR; the agent never approves or merges its own PR.
- Add a changelog fragment (`npm run changelog`) or the `skip-changelog` label.
- Before opening: `/code-review` for bugs, `/simplify` for the diff, `/security-review` on High-tier changes, then the fresh-context `reviewer` agent (`.claude/agents/reviewer.md`) against [`REVIEW.md`](REVIEW.md). Fix what they find at the source.
- Fill in Testing (with command output), Risk (the tier from `REVIEW.md`) and How to revert in the PR template; link the issue and any intent, spec or plan.
- Answer every review finding: fix it, or resolve the thread with a one-line reason. After three rounds with Important findings open, stop and rethink the approach.

## Conventions

- Commits: one line, under 72 characters, Conventional Commit prefix (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `ci:`, `build:`). No `Co-Authored-By` or AI attribution in commits or PRs.
- Keep changes tightly scoped, and keep data syncs separate from feature changes. Contributor setup is in [`CONTRIBUTING.md`](CONTRIBUTING.md).
