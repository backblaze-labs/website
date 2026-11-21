# Intent: scale review by risk

Author: @goanpeca · Issue: #131 · Status: draft

## Problem

As more PRs here are agent-written, every PR gets the same manual review
regardless of risk. A catalog copy fix and a change to the sync pipeline or a
workflow get the same scrutiny, which both slows low-risk changes and
under-reviews high-risk ones.

## Proposed outcome

Most PRs merge with at most one human in the loop, with no rise in reverts or
broken deploys. The written parts land with the SDLC adoption PR; the settings
below are for the code owners to accept, reshape or close:

- Risk tiers set by the change, not the author (`REVIEW.md` "Risk tiers"), with High-tier paths owned in `CODEOWNERS`.
- An AI reviewer on every PR (Claude Code Review at Quick or Standard depth, or Copilot review) following `REVIEW.md`, plus an automated security review.
- Branch protection on `main`: require code-owner review, require `checks` and `changelog` to pass, require conversation resolution, dismiss stale approvals on new commits, require branches to be up to date.
- An agent's approval never fills a required human slot.
- Track `npm run review:metrics` monthly; tighten the tiers if reverts rise.

## Constraints

- The GitHub Pages deploy on merge to `main` must stay green; nothing may ship a broken site unreviewed.
- Keep it light: this is a small site with a few maintainers, not an enterprise monorepo. No merge queue, feature flags or staged releases at this volume.

## Open questions

- Which AI reviewer and depth, and who owns its API budget or seat?
- Is a nightly review agent over existing code worth its cost here? Likely not yet.
- Should Low-tier PRs from maintainers merge with zero human approvals once the AI review is green, or keep the one-approval floor?
