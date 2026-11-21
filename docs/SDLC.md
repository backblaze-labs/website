# SDLC

How a change moves from idea to deploy on this repo, following the AI-native SDLC
playbook adapted to a small static site. The goal is that most PRs merge with at
most one human in the loop, without more reverts or broken deploys.

## When the full chain applies

Most changes here are small: a catalog entry, a component fix, a copy change, a
dependency bump. Those go straight to code with the GitHub issue as the record.
Use the full `intent` to `spec` to `plan` chain for larger changes: a new page or
section, a change to the catalog schema or the sync and discover pipeline, a new
workflow, or anything that changes how contributors or agents work. Changes from
outside the maintainers get a "should we do this?" answer on the issue first.

## The chain

Each larger change lives in `intent/<slug>/`:

1. `intent.md` is the problem, the outcome, constraints and open questions. Written by the originator, accepted by a maintainer. No design yet.
2. `spec.md` is numbered requirements, the design, and how each constraint is met. Written by the agent, accepted by a maintainer.
3. `plan.md` is the files that change, ordered steps citing requirement numbers, risks, and the proof for each. Written in plan mode, accepted before any code.

A human accepts each artifact before the next; never mark one approved on their
behalf. Templates are in [`../intent/README.md`](../intent/README.md). The
playbook skills in `.claude/skills/` drive each step; start with `ai-native-sdlc`.

## Review layers

Each layer catches what the one before misses.

1. **Before the PR.** `npm run ci` with its output, the Claude Code hooks (Biome on edit, ask before protected paths), and a visual check for UI. Then `/code-review` for bugs, `/simplify` for the diff, `/security-review` on High-tier changes, and the fresh-context `reviewer` agent in `.claude/agents/`.
2. **AI review on the PR.** An AI reviewer reads the diff against the repo and the issue, following [`../REVIEW.md`](../REVIEW.md). Findings are inline, tagged Important, Nit or Pre-existing, and every one is answered: fixed, or resolved with a reason.
3. **Security.** The Security pass in `REVIEW.md`. An open Security or Important thread blocks merge.
4. **Required checks.** `ci.yml` (lint, format, typecheck, validate, docs lint, spellcheck, build) and `changelog.yml`.
5. **Risk-tiered human approval.** The tiers in `REVIEW.md`, enforced by `CODEOWNERS`. An agent approval never counts as a human one.
6. **Deploy.** Merging to `main` deploys to GitHub Pages via `deploy.yml`. There is no merge queue or feature flag at this volume; branches are kept current with `main` before merge instead.
7. **Detect and roll back.** See below.

## Build, review, deploy

- Build and verify locally with `npm run ci` (the mirror of `ci.yml`).
- Review follows [`../REVIEW.md`](../REVIEW.md); the recurring lessons are in [`review-lessons.md`](review-lessons.md).
- Every PR adds a changelog fragment (`npm run changelog`) or the `skip-changelog` label; `changie` assembles `CHANGELOG.md`.
- The changelog is the human-readable record of what shipped; see [`../RELEASE.md`](../RELEASE.md).

## When something ships broken

- Roll back in one step: revert the merge commit on `main`; the deploy reruns.
- Then ask which layer should have caught it, without blaming a person. Fix that layer: a check or hook first, a `REVIEW.md` rule or a skill next, a line in [`review-lessons.md`](review-lessons.md) last.
- Record the miss under "Known misses" in `review-lessons.md`. That list is the eval set: when the review prompts, skills or model change, rerun the reviewer on those PRs and keep the change only if it still catches them.

## Measuring

`npm run review:metrics` reports, for recent merged PRs, human approvals and comments per PR, review rounds, time to first human review, and reverts. Human time per PR should fall while the revert count stays flat; if reverts rise, the time was moved, not saved, and the tiers tighten.

## Norms

- You land it, you own it: the author, or the person directing the agent, fixes what their change breaks.
- Keep changes small and reversible; blast radius sets how many people and checks a change gets.
- Raise direction changes early on the issue, not as blocking comments on a finished PR.
