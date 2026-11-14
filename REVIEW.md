# Review Instructions

For human reviewers and review agents. Approval always comes from a code owner in
[`.github/CODEOWNERS`](.github/CODEOWNERS). An agent's approval never counts as a
human approval and never fills a required human slot, and the agent that wrote a
change never reviews it. Priorities, in order: catch real bugs, then cut review
rounds.

## What failure looks like here

This site fails by:

- shipping a broken build or a card that renders wrong, in a theme or at a breakpoint the author did not check;
- a new `pull_request` workflow that forgets the Dependabot CI guard, so dependabot PRs start spending CI minutes;
- hand-edits to generated data (`github-stats.json`, `links.json`, `previews.json`, `preview-sources.json`) that the next sync silently overwrites, or a `labs.json` entry that does not match the schema;
- a catalog entry whose metadata was not sourced upstream, or whose `url` or preview image is dead;
- an internal link that drops the Astro `base` path, so it 404s on GitHub Pages;
- docs that lie: a README, `AGENTS.md` or card description that claims what the code does not do.

A check that passes either way is also a failure: it claims coverage it does not give.

## Risk tiers

The change sets the tier, not the author. Pick the highest tier any file in the
diff hits and state it in the PR template.

| Tier | Examples | Human approvals |
| --- | --- | --- |
| Low | Docs, copy, a single `labs.json` entry, a scheduled data sync, a changelog fragment | One code owner; the person directing the agent may be that owner once CI and the AI review are green |
| Medium | Components, layouts, styles, pages, `public/` assets, dependency bumps | One code owner who is not the author |
| High | `.github/` (workflows, `CODEOWNERS`), `scripts/`, `src/data/labs.schema.json`, `astro.config.mjs`, `package.json`, `.claude/` hooks and settings, `REVIEW.md`, `AGENTS.md` | One code owner who is not the author, and a passing `npm run ci` with output in the PR |

- Any CI workflow file is always High, whatever else changes.
- Ask "does this change need a person even though its tier says no?" A Low change that touches the deploy, links every card, or rewrites many entries is Medium.
- Only maintainers in `@backblaze-labs/maintainers` get the Low path as authors; anyone else's PR is reviewed by a maintainer.
- On an agent-written PR, the person directing the agent is a required reviewer and owns the outcome.
- An approval covers one commit. New commits the reviewer has not seen (an agent push, a hand-resolved merge) need a fresh look before merge.

## Before the passes

1. Read the linked issue and, if present, the change's `intent/<slug>/spec.md` and `plan.md` (see [`docs/SDLC.md`](docs/SDLC.md)). Ask whether the change solves that problem and fits the site; for a bug fix, whether it fixes the root cause.
2. Read [`docs/review-lessons.md`](docs/review-lessons.md). A PR that repeats a listed lesson gets the finding with the lesson.
3. Check the PR out on current `main` and run `npm run ci`. Say what you ran.
4. For a visual change, view it at mobile and desktop widths in dark, light and system themes.

## Passes

Tag each finding with its pass.

- **Build and render**: the site builds, cards render, internal links resolve with the `base` path, no console errors, responsive and theme-correct.
- **Data and catalog**: only `labs.json` is hand-edited and matches the schema; generated files are left to the sync scripts; new entries source metadata upstream and have a live `url` and preview.
- **CI and workflows**: any new `pull_request` workflow carries the Dependabot guard on every job; actions are pinned; a changelog fragment or the `skip-changelog` label is present.
- **Security**: no `pull_request_target` or `workflow_run` running PR code; `permissions:` are least-privilege; no secrets echoed or passed to PR-controlled steps; no untrusted `${{ github.event.* }}` interpolated into `run:`; no new third-party script, iframe or tracking on the site; scripts that fetch remote content do not write outside `src/data/` or `public/`. Use `/security-review` locally on High-tier changes.
- **Content**: docs and UI copy claim only what the code does; the PR description matches the final diff; `CONVENTIONS.md` is honored; changed behavior updates the lines in `AGENTS.md` it makes stale.
- **Accessibility and UX**: contrast, focus, keyboard and alt text hold for new UI.

## Skip

Do not review line by line: `package-lock.json`, `CHANGELOG.md` (assembled by changie), the generated `src/data/*.json` files other than `labs.json` (check only that a sync script produced them), `dist/`, and binary assets in `public/` beyond confirming they load. Do not report what CI already enforces (Biome lint and format, typecheck, cspell, markdown and link lint, the JSON-schema validate).

## Severity

- **Important**: breaks the build or deploy, breaks a card or an internal link, lets dependabot PRs run CI, weakens a workflow's security, corrupts the catalog or its schema, or ships a dead link or preview. A claimed behavior with no check pinning it is Important.
- **Nit**: style, naming, copy. Report at most five per review and summarize the rest as a count. Drop cleanup-only findings unless they hide a bug.
- **Pre-existing**: a real bug this PR did not introduce. Report it so it is not lost, but it does not block this PR and is not the author's fault; suggest an issue.

## Evidence

Every finding cites `file:line` and says what goes wrong, with the input or step that triggers it. Do not infer behavior from a name; read the code. If you could not verify something (no preview, no visual check), say so. Post a finding only if you would bet it is real; when several agents review, keep only findings a second, independent pass confirms.

## Converging

Round 1 reviews the whole diff; from round 3 on, only the commits since your last review. Name the class of bug so the author fixes every instance, not one line. Never repeat a finding already posted, resolved or not. After three rounds with Important findings still open, stop and ask the author to reconsider the approach. If most of what you keep flagging predates the PR, it is Pre-existing, not a reason for another round.

## Answering findings

Every finding gets an answer before merge: fix it, or resolve the thread with a one-line reason (false positive, intentional, out of scope with an issue link). Do not resolve a thread silently. Do not merge with an open Important or Security thread. Re-read the PR description after each round and update it if the diff moved.

## Format

Start with a count (`2 Important, 1 Nit, 0 Pre-existing`, or `No issues found`), then the tier, then what you checked and against what (issue, commands run, themes and widths). Then a table sorted by severity:

| Severity | File:Line | Pass: finding |
| --- | --- | --- |
