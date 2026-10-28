# Release and deploy

This site has no versioned package release: merging to `main` deploys to GitHub
Pages via [`deploy.yml`](.github/workflows/deploy.yml). The changelog is the
human-readable record of what shipped.

## Changelog

Entries are per-PR fragments managed by [changie](https://changie.dev):

- Add one on every user-visible PR: `npm run changelog` (runs `changie new`),
  pick a kind, write a one-line body. Fragments land in `.changes/unreleased/`.
- A PR with no user-visible change (a pure refactor, CI, or chore) can carry the
  `skip-changelog` label instead.
- The `changelog` check (`.github/workflows/changelog.yml`) enforces this on PRs;
  Dependabot PRs are exempt by the same guard as `ci.yml`.

## Assembling a changelog section

Periodically (not on every merge), roll unreleased fragments into a dated
section:

```bash
npm run changelog:batch   # changie batch auto: folds fragments into a version
npm run changelog:merge   # changie merge: regenerates CHANGELOG.md
```

Review the diff, then commit `CHANGELOG.md` and the cleared `.changes/`. There is
no package publish step; the next merge to `main` deploys the result.
