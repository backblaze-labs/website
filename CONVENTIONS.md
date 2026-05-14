# Upstream metadata conventions

The Backblaze Labs website auto-discovers integrations from three sources and projects them into the gallery. **The site is a projection — the source of truth lives upstream.** Adding the right metadata to your repo or sub-issue means the integration appears on the site automatically, no PR to this repo required.

## Sources

| Source | What gets discovered |
| --- | --- |
| [`github.com/backblaze-labs`](https://github.com/backblaze-labs) | Public, non-archived repos **with the `b2-labs` topic** |
| [`github.com/backblaze-b2-samples`](https://github.com/backblaze-b2-samples) | Public, non-archived repos **with the `b2-labs` topic** |
| Tier-1 tracking issues (currently [`backblaze-labs/demand-side-ai#5`](https://github.com/backblaze-labs/demand-side-ai/issues/5)) | Closed sub-issues / `[x]` task-list items |

The CI workflow [`discover.yml`](.github/workflows/discover.yml) runs every Monday and opens a PR with the week's proposed entries. The PR body breaks down which entries are "ready" (everything inferred cleanly — merge as-is) vs "need upstream fix" (description missing — go fix the source repo and close the PR; next Monday's run picks them up).

A separate workflow ([`refresh-stats.yml`](.github/workflows/refresh-stats.yml)) refreshes star counts / last-push timestamps **daily and commits straight to main** — stats are low-risk numeric data that nobody needs to review.

---

## Conventions for repos

**There is exactly one piece of opt-in metadata: the `b2-labs` topic.** Add it to a repo's GitHub topics and the discovery script will include it in the catalog. Without it, the repo is silently ignored — no need to opt-out individual repos.

Everything else is inferred:

| Catalog field | Inferred from |
| --- | --- |
| `id`, `title` | Repo name |
| `tagline`, `description` | Repo description (first sentence ≤ 80 chars → tagline; full → description) |
| `language` | Primary GitHub language |
| `tags` | Repo topics (with `b2-labs` stripped) |
| `categories` | Standard topics (table below) — falls back to `developer-tools` |
| `type` | Repo name patterns + standard topics |
| `icon` | Inferred from categories |
| `url` | Repo URL by default; `pypi` topic → PyPI; `npm` topic → npm registry |
| `accent`, `featured` | `accent: red`; `featured: false`. Hand-flip `featured: true` in `labs.json` after merge if needed. |

### The only thing you need to write well

**The repo description.** It becomes the tagline (first sentence) and the long-form description on the card. If the repo has no description, the entry lands as a TODO and the weekly PR flags it.

### Standard topics that map to categories

Use any of these (no `b2-` prefix needed) and you get the matching category:

| Topic | Category |
| --- | --- |
| `machine-learning`, `ml`, `mlops`, `ai`, `generative-ai`, `image-generation`, `video-generation`, `audio-generation`, `ai-pipeline`, `ai-infrastructure` | **AI / ML** |
| `data-pipeline`, `etl` | **Data Pipelines** |
| `jupyter`, `jupyterlab`, `ipython`, `notebook` | **Notebooks** |
| `vscode`, `vscode-extension`, `intellij`, `ide` | **IDE Extensions** |
| `claude`, `agent`, `agent-skill`, `skill`, `mcp` | **Agent Skills** |
| `infrastructure`, `infra` | **Infrastructure** |
| `cli`, `devtools`, `developer-tools`, `sdk` | **Developer Tools** |

Repos starting with `awesome-` automatically pick up the **Awesome Lists** category.

### URL routing

Card click goes to the GitHub repo by default. Two auto-overrides:

| Topic | Where the card links |
| --- | --- |
| `pypi` | `https://pypi.org/project/<repo-name>/` |
| `npm` | `https://www.npmjs.com/package/<repo-name>` |

For VS Code Marketplace and other registries, hand-edit `url` in `labs.json` after merge (still a small number of cases).

### Concrete example: `jupyter-b2`

A complete repo configuration is two things:

- **Description on GitHub:** `Jupyter/IPython magic commands and fsspec backend for Backblaze B2.`
- **Topics on GitHub:** `b2-labs`, `jupyter`, `ipython`, `fsspec`, `magic`, `python`, `pypi`

Discovery produces, with no further input:

```json
{
  "id": "jupyter-b2",
  "title": "Jupyter B2",
  "tagline": "Jupyter/IPython magic commands and fsspec backend for Backblaze B2.",
  "description": "Jupyter/IPython magic commands and fsspec backend for Backblaze B2.",
  "categories": ["notebooks"],
  "type": "tool",
  "language": "python",
  "tags": ["jupyter", "ipython", "fsspec", "magic", "python", "pypi"],
  "repo": "backblaze-labs/jupyter-b2",
  "url": "https://pypi.org/project/jupyter-b2/",
  "icon": "notebook",
  "accent": "red",
  "featured": false
}
```

Zero hand-written JSON.

---

## Conventions for the upstream-integrations tracker

[`backblaze-labs/demand-side-ai#5`](https://github.com/backblaze-labs/demand-side-ai/issues/5) tracks integrations of **all** kinds — including ones we ship as repos in our own orgs. The label on each sub-issue tells the discovery script where the implementation lives:

| Sub-issue label | Where the implementation lives | What discovery does |
| --- | --- | --- |
| `B2 Documentation` | Upstream project's docs (e.g. mlflow.org, docs.cvat.ai) | Creates an **upstream entry** (`repo: null`, `source: "<Project>"`) on close |
| `B2 Tool/Plugin` | A repo in `backblaze-labs/*` | Skipped at the tracker level — the **repo discovery** handles it |
| `B2 Example` | A repo in `backblaze-b2-samples/*` | Skipped at the tracker level — the **repo discovery** handles it |
| `B2 Integration` (alone) | Ambiguous — defaults to upstream entry | Creates an upstream entry on close |

So for `B2 Tool/Plugin` and `B2 Example` items: the closed sub-issue is the *tracking signal* that the work is done, but the canonical catalog entry comes from the repo (which must be tagged `b2-labs`).

Each closed sub-issue (or `[x]` task-list item) becomes a card unless its label says the implementation already lives in one of our org repos.

### Modifier labels (stack with the labels above)

| Label | Effect |
| --- | --- |
| `B2 Feature on website` | Reconciles `featured` on the catalog entry to track the label's current state. **Bidirectional**: adding the label flips the entry to `featured: true` on the next sync; removing the label flips it back to `false`. The tracker is the source of truth — hand-edits to `labs.json` get overwritten on the next discovery run for entries with a tracker counterpart. |

The reconciliation matches the catalog entry by id:

- For sub-issues with `B2 Documentation` / `B2 Integration` labels (upstream cards), the id is the URL-host slug (e.g. `docs.cvat.ai` → `cvat`).
- For sub-issues with `B2 Tool/Plugin` / `B2 Example` labels and a `plugin:` URL in the body, the id is the repo basename run through the same `b2-`/`backblaze-`-stripping rule that produces the catalog id (e.g. `plugin: https://github.com/backblaze-b2-samples/b2-whisper-transformersjs-transcriber` → `whisper-transformersjs-transcriber`; `plugin: https://github.com/backblaze-labs/b2-action` → `b2-action`, since stripping would leave a single token).

Catalog entries without a tracker counterpart (purely curator-added via `labs.json`) keep their hand-set `featured` value untouched.

### Sub-issue body format

The sub-issue body is plain flat `key: value` lines — **no fence, no marker, no YAML codeblock.** When you close the sub-issue, discovery parses these directly:

```yaml
issue: https://github.com/meltano/meltano/issues/9988
pull_request: https://github.com/meltano/meltano/pull/9990
docs: https://docs.meltano.com/concepts/state_backends/#backblaze-b2-example
user_agent_extra: meltano
```

#### Structural fields (the ones you actually fill in)

| Field | Purpose |
| --- | --- |
| `issue` | Upstream issue URL. Informational; not used as the card destination. |
| `pull_request` | Upstream PR URL. Used as fallback destination if `docs:` is null. |
| `pull_request_rejected` | Superseded / closed PR. Last-resort destination, useful for context. |
| `docs` | Upstream docs page. **Preferred card destination** when present. |
| `plugin` | Repo URL in `backblaze-labs/*` or `backblaze-b2-samples/*`. When present, repo discovery handles the card and the tracker entry is skipped. |
| `user_agent_extra` | Stable identifier (e.g. `meltano`, `pixeltable`, `b2ai-mlflow`). Used as the slug fallback when URL host doesn't help. The `b2ai-` prefix is stripped automatically. |

Card destination URL is resolved as: `docs` → `pull_request` → `pull_request_rejected` → `issue`.

Literal `null`, `none`, `n/a`, `tbd`, `todo`, and empty strings all mean "not set" — `meta.docs || meta.pull_request` works as you'd expect.

#### Catalog override fields (optional)

If discovery's auto-inference produces something off, override per-key in the same flat format:

| Key | Default behavior |
| --- | --- |
| `source` | Sub-issue title with suffixes like " Integration"/" tool" stripped. |
| `tagline` | The destination page's `<meta og:title>` / `<title>`, capped at 80 chars. |
| `description` | The page's `<meta name="description">` / `og:description`. |
| `categories` (comma-sep) | Defaults to `ai-ml`. **The one field you'll often want to set.** |
| `language` | Defaults to `python`. |
| `tags` (comma-sep) | Heuristic from URL host + source name + `s3-compatible`. |
| `icon` | Defaults to `flow`. |
| `id` | URL host slug → `user_agent_extra` → title slug. |
| `title` | Sub-issue title with " Integration" suffix stripped. |
| `accent`, `featured` | `accent: red`, `featured: false`. |

So a fully overridden body looks like:

```yaml
docs: https://docs.example.com/storage/backblaze-b2
pull_request: https://github.com/example/example/pull/123
user_agent_extra: example
source: Example
tagline: Backblaze B2 as a cloud storage backend for Example.
description: Example supports B2 via the S3-compatible API. Configure your B2 endpoint and credentials and Example persists data to B2 — same path as the S3 backend.
categories: ai-ml, data-pipelines
tags: example, s3-compatible
icon: flow
```

**The minimum needed to ship a card is just `docs:` (or `pull_request:`).** Everything else is inferred from the destination page's meta tags.

---

## Removal policy

**Once a repo is in `labs.json`, it stays unless a maintainer removes it by hand.** Discovery is append-only. There is no flow — manual or automated — that removes entries based on upstream changes.

Two scenarios specifically:

- **`b2-labs` topic accidentally removed.** The weekly run flags it as `topic-missing` in the PR body and tells you which repo lost the topic. The catalog entry stays put. Re-add the topic on GitHub when you notice. Re-tagging makes the warning disappear next run.
- **Repo deleted, transferred, or made private.** Flagged as `removed` in the PR body. Entry stays. A maintainer decides whether to keep it (if it lives on under a new owner) or hand-remove the JSON entry.

The tooling deliberately can't auto-remove because:

1. Catalog inclusion is a public statement; revoking it should be a deliberate human act.
2. Topic toggles are easy to fat-finger; auto-removal would punish accidents.
3. PR-based merge is the only mutation path and it's purely additive.

## Auditing

To see what discovery currently proposes (and what it would warn about):

```bash
npm run discover
```

Output covers four categories:

- **Complete** — entries with all fields inferred from upstream metadata. Will land cleanly.
- **Needs-metadata** — proposed entry has TODO placeholders (usually missing description). Fix the upstream and rerun.
- **Topic-missing (stale)** — existing entry's repo lost the `b2-labs` topic. Re-tag on GitHub.
- **Removed (stale)** — existing entry's repo no longer in either org. Manual review.
