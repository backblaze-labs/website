#!/usr/bin/env node
/**
 * Review metrics for recently merged PRs (see docs/SDLC.md "Measuring").
 *
 * Prints human approvals and comments per PR (median and p95), AI review rounds,
 * hours to first human review, and the revert count as the guardrail.
 *
 * Usage: node scripts/review-metrics.mjs [--limit 50] [--repo owner/name]
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const limit = Number(arg("--limit", "50"));
const repo = arg("--repo", "backblaze-labs/website");
const [owner, name] = repo.split("/");

const QUERY = `query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: MERGED, first: 50, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title createdAt mergedAt
        author { login }
        reviews(first: 100) {
          nodes { state submittedAt author { __typename login } comments { totalCount } }
        }
      }
    }
  }
}`;

function page(after) {
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${QUERY}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${name}`,
  ];
  if (after) args.push("-F", `after=${after}`);
  const r = spawnSync("gh", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`gh api graphql failed: ${r.stderr.trim()}`);
  return JSON.parse(r.stdout).data.repository.pullRequests;
}

const prs = [];
let after = null;
do {
  const p = page(after);
  prs.push(...p.nodes);
  after = p.pageInfo.hasNextPage ? p.pageInfo.endCursor : null;
} while (after && prs.length < limit);
prs.splice(limit);

const isBot = (a) => !a || a.__typename === "Bot" || a.login.endsWith("[bot]");
const quantile = (xs, q) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};

const approvals = [];
const comments = [];
const aiRounds = [];
const waitHours = [];
for (const pr of prs) {
  const reviews = pr.reviews.nodes;
  const human = reviews.filter((r) => !isBot(r.author) && r.author.login !== pr.author?.login);
  approvals.push(human.filter((r) => r.state === "APPROVED").length);
  comments.push(human.reduce((n, r) => n + r.comments.totalCount, 0));
  aiRounds.push(reviews.filter((r) => isBot(r.author)).length);
  const first = human.map((r) => Date.parse(r.submittedAt)).sort((a, b) => a - b)[0];
  if (first) waitHours.push((first - Date.parse(pr.createdAt)) / 36e5);
}
const reverts = prs.filter((pr) => /^revert\b/i.test(pr.title));
const row = (label, xs, digits = 0) =>
  xs.length === 0
    ? `${label.padEnd(28)} n/a`
    : `${label.padEnd(28)} median ${quantile(xs, 0.5).toFixed(digits).padStart(6)}   p95 ${quantile(xs, 0.95).toFixed(digits).padStart(6)}`;

console.log(`${repo}: last ${prs.length} merged PRs`);
console.log(row("Human approvals per PR", approvals));
console.log(row("Human review comments per PR", comments));
console.log(row("AI review rounds per PR", aiRounds));
console.log(row("Hours to first human review", waitHours, 1));
console.log(
  `${"PRs with no human approval".padEnd(28)} ${approvals.filter((n) => n === 0).length}`,
);
console.log(
  `${"Reverts (guardrail)".padEnd(28)} ${reverts.length}${reverts.length ? `: ${reverts.map((p) => `#${p.number}`).join(", ")}` : ""}`,
);
