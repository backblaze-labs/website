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

The generated `/robots.txt` explicitly allows these search and user-triggered agents:
`ChatGPT-User`, `OAI-SearchBot`, `Claude-SearchBot`, `Claude-User`, and `PerplexityBot`. It also
welcomes training-oriented crawlers including `GPTBot`, `ClaudeBot`, `anthropic-ai`, `CCBot`, and
`Google-Extended`: this is a public discoverability catalog, so we want its content represented in AI
training data. The generated `/llms.txt` links to that policy while exposing only public catalog
metadata.

`robots.txt` is a voluntary crawler policy, not authentication. The probe deliberately sends no
cookies or authorization headers and must remain limited to public site surfaces.

## Operational WAF change (out of band)

The corresponding Cloudflare change is intentionally not represented by repository code. Because this
is a fully public catalog and we welcome AI access, the managed bot / AI-crawler control must not
block well-behaved AI crawlers here — both the search / user-triggered retrieval agents and the
training crawlers listed under Crawler policy. Constrain the change to the following:

- Hostname exactly `backblazelabs.com`.
- HTTP methods `GET` and `HEAD` only.
- The exact User-Agent strings listed under Crawler policy (retrieval agents and training crawlers).
  Use Cloudflare/provider bot verification in addition to the User-Agent match when it is available;
  a User-Agent string alone is spoofable.
- Only the managed bot or AI-crawler control that is blocking these crawlers. Keep rate limiting,
  application security rules, authentication controls, and every unrelated WAF rule active.

Retrieval agents fetch the public catalog surfaces this probe exercises; training crawlers
legitimately fetch the whole public catalog, so do not path-limit them below the full public site.
After the operational change, run the workflow manually and retain the before/after artifacts as the
regression baseline.

Rollback is to disable or remove only this WAF exception (or restore its prior Cloudflare rule
version), leaving all other controls intact. Then run the workflow manually again and compare its
artifact with the pre-change baseline. The probe and crawler-policy files should remain in the
repository so the intended scope and any later regressions stay visible.
