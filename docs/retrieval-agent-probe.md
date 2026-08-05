# Retrieval Agent Regression Probe

This probe records whether approved search and user-triggered retrieval agents can fetch the public
Backblaze Labs catalog. It uses public HTTP requests only: no application credentials, private
content, Cloudflare tokens, or repository secrets.

## Run locally

```bash
npm run probe:retrieval
```

The default base URL is `https://backblazelabs.com`. Override it for a local or preview deployment:

```bash
RETRIEVAL_PROBE_BASE_URL=http://localhost:4321 npm run probe:retrieval
```

The JSON report is written to `artifacts/retrieval-probe/results.json` by default. Override that path
with `RETRIEVAL_PROBE_OUTPUT`; relative paths resolve from the repository root.

Each run sends every User-Agent to every endpoint, producing 35 result rows. The two columns below
are independent sets whose Cartesian product forms the request matrix; rows are not endpoint/agent
pairs.

| Endpoints | User-Agents |
| --- | --- |
| `/` | `ChatGPT-User` |
| `/category/developer-tools/` | `OAI-SearchBot` |
| `/projects/vibe-coding-starter-kit/` | `Claude-SearchBot` |
| `/feed.json` | `Claude-User` |
| `/llms.txt` | `PerplexityBot` |
| `/robots.txt` | |
| `/sitemap.xml` | |

Every result contains `endpoint`, `userAgent`, nullable `statusCode`, and an ISO `timestamp`. A
network failure has no HTTP status, so it is recorded with `statusCode: null` and an `error` string.
HTTP errors such as 403 and 404 are recorded without failing the script; this preserves the entire
matrix for WAF rollout and rollback comparisons. The console prints the same matrix in a readable
table plus response totals.

## GitHub Actions

[`retrieval-agent-probe.yml`](../.github/workflows/retrieval-agent-probe.yml) runs daily and through
`workflow_dispatch`. A manual run can override the base URL. The workflow requires no secrets and
uploads the JSON report as a 30-day artifact named for the workflow run.

## Crawler policy

This is a fully public discoverability catalog, so the generated `/robots.txt` welcomes every crawler
— AI search, user-triggered retrieval, and training crawlers alike — with a single `User-agent: *` /
`Allow: /`. We want the catalog both fetchable by retrieval agents (`ChatGPT-User`, `OAI-SearchBot`,
`Claude-SearchBot`, `Claude-User`, `PerplexityBot`) and represented in AI training data (`GPTBot`,
`ClaudeBot`, `anthropic-ai`, `CCBot`, `Google-Extended`, and any others). The generated `/llms.txt`
links to that policy while exposing only public catalog metadata.

`robots.txt` is a voluntary crawler policy, not authentication. The probe deliberately sends no
cookies or authorization headers and must remain limited to public site surfaces.

## Operational WAF / Cloudflare posture (out of band)

The corresponding Cloudflare posture is intentionally not represented by repository code. Because this
is a fully public catalog and we want maximum AI visibility, Cloudflare's managed bot / AI-crawler
control must **not** block AI crawlers on `backblazelabs.com` — neither the search / user-triggered
retrieval agents nor the training crawlers. There is no per-User-Agent allow-list to maintain: the
goal is simply that well-behaved AI crawlers are not blocked here.

- Scope any change to hostname `backblazelabs.com`.
- If a managed bot or AI-crawler rule is returning 4xx/5xx to AI crawlers, disable that specific
  control (or exempt the AI-crawler bot category) for this hostname.
- Keep every generic protection active: rate limiting, DDoS mitigation, application-security rules,
  and authentication controls. Those are unrelated to the AI-crawler block and should stay on.

After the change, run the workflow manually and retain the before/after artifacts as the regression
baseline. Rollback is to re-enable the managed AI-crawler control (or restore its prior Cloudflare
rule version), leaving all other controls intact; then run the workflow again and compare against the
pre-change baseline. The probe and crawler-policy files should remain in the repository so the
intended posture and any later regressions stay visible.
