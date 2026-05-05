# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability **in this website**, please report it privately rather than opening a public issue.

- **Preferred:** open a [GitHub security advisory](https://github.com/backblaze-labs/website/security/advisories/new) (only the maintainer team will see it).
- **Or:** email **security@backblaze.com** with a clear description, reproduction steps, and any impact assessment.

We'll acknowledge receipt within **2 business days** and aim to provide a remediation timeline within **7 business days**.

## Scope

This policy covers `backblaze-labs/website` — the static site you're reading. It does **not** cover:

- The Backblaze B2 Cloud Storage service. Report B2 issues via [Backblaze Support](https://www.backblaze.com/help.html) or the [Backblaze responsible disclosure process](https://www.backblaze.com/security.html).
- Third-party integrations listed in `labs.json`. Each project has its own repo and security policy.

## What we consider in scope

- XSS / CSRF / clickjacking vectors in the rendered site.
- Build / deploy supply-chain issues (e.g. malicious dependency, workflow injection).
- Leaked secrets in this repo or its CI artifacts.

## What we consider out of scope

- Theoretical issues without a working PoC.
- Best-practice recommendations (open a regular issue for those).
- Vulnerabilities in dependencies that are already patched and tracked by Dependabot.

Thank you for helping keep Backblaze Labs safe.
