#!/usr/bin/env node
/**
 * Exercise public catalog surfaces with approved search and user-triggered
 * retrieval User-Agent strings. HTTP failures are observations, not script
 * failures: every matrix row is written so operators can compare WAF behavior.
 *
 * Configuration:
 *   RETRIEVAL_PROBE_BASE_URL  Site origin/base path (default: production).
 *   RETRIEVAL_PROBE_OUTPUT    JSON report path, relative to the repo root.
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import url from "node:url";

const DEFAULT_BASE_URL = "https://backblazelabs.com";
const DEFAULT_OUTPUT_PATH = "artifacts/retrieval-probe/results.json";
const REQUEST_TIMEOUT_MS = 20_000;

const ENDPOINTS = [
  "/",
  "/projects/vibe-coding-starter-kit/",
  "/category/developer-tools/",
  "/feed.json",
  "/llms.txt",
  "/robots.txt",
  "/sitemap.xml",
];

const USER_AGENTS = [
  "ChatGPT-User",
  "OAI-SearchBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
];

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function normalizeBaseUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`RETRIEVAL_PROBE_BASE_URL is not a valid URL: ${raw}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("RETRIEVAL_PROBE_BASE_URL must use http or https");
  }
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

function errorMessage(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function requestEndpoint(baseUrl, endpoint, userAgent) {
  const targetUrl = `${baseUrl}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl, {
      credentials: "omit",
      headers: {
        accept: "*/*",
        "user-agent": userAgent,
      },
      redirect: "follow",
      signal: controller.signal,
    });
    try {
      await response.body?.cancel();
    } catch {}
    return {
      endpoint,
      userAgent,
      statusCode: response.status,
      timestamp: new Date().toISOString(),
      finalUrl: response.url,
    };
  } catch (error) {
    return {
      endpoint,
      userAgent,
      statusCode: null,
      timestamp: new Date().toISOString(),
      error: errorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function printSummary(baseUrl, outputPath, results) {
  const endpointWidth = Math.max("ENDPOINT".length, ...results.map((row) => row.endpoint.length));
  const userAgentWidth = Math.max(
    "USER AGENT".length,
    ...results.map((row) => row.userAgent.length),
  );
  const statusWidth = "STATUS".length;

  console.log("Retrieval agent probe");
  console.log(`Base URL: ${baseUrl}`);
  console.log("");
  console.log(
    `${"ENDPOINT".padEnd(endpointWidth)}  ${"USER AGENT".padEnd(userAgentWidth)}  ${"STATUS".padEnd(statusWidth)}  TIMESTAMP`,
  );
  console.log(
    `${"-".repeat(endpointWidth)}  ${"-".repeat(userAgentWidth)}  ${"-".repeat(statusWidth)}  ${"-".repeat(24)}`,
  );
  for (const row of results) {
    const status = row.statusCode === null ? "ERROR" : String(row.statusCode);
    console.log(
      `${row.endpoint.padEnd(endpointWidth)}  ${row.userAgent.padEnd(userAgentWidth)}  ${status.padEnd(statusWidth)}  ${row.timestamp}`,
    );
    if (row.error) console.log(`${" ".repeat(endpointWidth + userAgentWidth + 6)}${row.error}`);
  }

  const successful = results.filter(
    (row) => row.statusCode !== null && row.statusCode >= 200 && row.statusCode < 300,
  ).length;
  const networkErrors = results.filter((row) => row.statusCode === null).length;
  const nonSuccessful = results.length - successful - networkErrors;
  console.log("");
  console.log(
    `Summary: ${results.length} requests; ${successful} 2xx; ${nonSuccessful} non-2xx; ${networkErrors} network errors.`,
  );
  console.log(`JSON report: ${path.relative(root, outputPath)}`);
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.RETRIEVAL_PROBE_BASE_URL ?? DEFAULT_BASE_URL);
  const outputPath = path.resolve(root, process.env.RETRIEVAL_PROBE_OUTPUT ?? DEFAULT_OUTPUT_PATH);
  const startedAt = new Date().toISOString();
  const results = [];

  // Five requests at a time keeps the probe quick without sending the whole
  // matrix as one burst. Result order stays endpoint-first and deterministic.
  for (const endpoint of ENDPOINTS) {
    const rows = await Promise.all(
      USER_AGENTS.map((userAgent) => requestEndpoint(baseUrl, endpoint, userAgent)),
    );
    results.push(...rows);
  }

  const completedAt = new Date().toISOString();
  const successful = results.filter(
    (row) => row.statusCode !== null && row.statusCode >= 200 && row.statusCode < 300,
  ).length;
  const networkErrors = results.filter((row) => row.statusCode === null).length;
  const report = {
    schemaVersion: 1,
    baseUrl,
    startedAt,
    completedAt,
    endpoints: ENDPOINTS,
    userAgents: USER_AGENTS,
    summary: {
      total: results.length,
      successful,
      nonSuccessful: results.length - successful - networkErrors,
      networkErrors,
    },
    results,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  printSummary(baseUrl, outputPath, results);
}

await main();
