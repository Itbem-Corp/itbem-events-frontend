#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_ROLLBACK_POLL_ATTEMPTS = 12;
const DEFAULT_ROLLBACK_POLL_DELAY_MS = 2_500;

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required`);
  }

  return value.trim();
}

function safePathSegment(value, label) {
  const normalized = requireNonEmptyString(value, label);
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error(`${label} contains unsupported characters`);
  }

  return encodeURIComponent(normalized);
}

function formatApiErrors(payload) {
  if (!Array.isArray(payload?.errors) || payload.errors.length === 0) {
    return "no API error details";
  }

  return payload.errors
    .slice(0, 5)
    .map((entry) => {
      const code = Number.isFinite(entry?.code) ? String(entry.code) : "unknown";
      const message =
        typeof entry?.message === "string"
          ? entry.message.replace(/[\r\n]+/g, " ").slice(0, 300)
          : "unknown error";
      return `${code}: ${message}`;
    })
    .join("; ");
}

export function redactSecrets(value, secrets = []) {
  let redacted = String(value ?? "");
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length > 0) {
      redacted = redacted.replaceAll(secret, "[REDACTED]");
    }
  }

  return redacted.replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]");
}

export function parseApiResult(payload, operation) {
  if (!payload || payload.success !== true || payload.result == null) {
    throw new Error(
      `Cloudflare ${operation} failed (${formatApiErrors(payload)})`,
    );
  }

  return payload.result;
}

function validateHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(requireNonEmptyString(value, label));
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS`);
  }

  return url.toString();
}

export function validateProductionDeployment(
  deployment,
  { expectedId, expectedCommitHash } = {},
) {
  if (!deployment || typeof deployment !== "object") {
    throw new Error("Cloudflare did not return a production deployment");
  }

  const id = requireNonEmptyString(deployment.id, "deployment id");
  if (expectedId && id !== expectedId) {
    throw new Error(`Cloudflare returned deployment ${id}, expected ${expectedId}`);
  }
  if (deployment.environment !== "production") {
    throw new Error(`deployment ${id} is not a production deployment`);
  }
  if (deployment.is_skipped === true) {
    throw new Error(`deployment ${id} was skipped`);
  }
  if (deployment.latest_stage?.status !== "success") {
    throw new Error(`deployment ${id} is not successful`);
  }

  if (expectedCommitHash) {
    const commitHash = deployment.deployment_trigger?.metadata?.commit_hash;
    if (commitHash !== expectedCommitHash) {
      throw new Error(
        `deployment ${id} has commit ${commitHash || "unknown"}, expected ${expectedCommitHash}`,
      );
    }
  }

  return {
    id,
    url: validateHttpsUrl(deployment.url, `deployment ${id} URL`),
  };
}

export function parseCanonicalProduction(payload) {
  const project = parseApiResult(payload, "project lookup");
  return validateProductionDeployment(project.canonical_deployment);
}

export function parseProductionDeployment(
  payload,
  expectedId,
  expectedCommitHash,
) {
  const deployment = parseApiResult(payload, "deployment lookup");
  return validateProductionDeployment(deployment, {
    expectedId,
    expectedCommitHash,
  });
}

export function readCloudflareConfig(environment = process.env) {
  return {
    accountId: requireNonEmptyString(
      environment.CLOUDFLARE_ACCOUNT_ID,
      "CLOUDFLARE_ACCOUNT_ID",
    ),
    apiToken: requireNonEmptyString(
      environment.CLOUDFLARE_API_TOKEN,
      "CLOUDFLARE_API_TOKEN",
    ),
    projectName: requireNonEmptyString(
      environment.CLOUDFLARE_PAGES_PROJECT,
      "CLOUDFLARE_PAGES_PROJECT",
    ),
  };
}

function projectPath(config) {
  return `/accounts/${safePathSegment(config.accountId, "account id")}/pages/projects/${safePathSegment(config.projectName, "project name")}`;
}

async function readJsonResponse(response, operation) {
  try {
    return await response.json();
  } catch {
    throw new Error(
      `Cloudflare ${operation} returned a non-JSON response (HTTP ${response.status})`,
    );
  }
}

export async function requestCloudflare(
  config,
  method,
  path,
  operation,
  { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is unavailable");
  }

  let response;
  try {
    response = await fetchImpl(`${CLOUDFLARE_API_BASE}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiToken}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = redactSecrets(
      error instanceof Error ? error.message : "network error",
      [config.apiToken],
    );
    throw new Error(`Cloudflare ${operation} request failed: ${reason}`);
  }

  const payload = await readJsonResponse(response, operation);
  if (!response.ok) {
    const details = redactSecrets(formatApiErrors(payload), [config.apiToken]);
    throw new Error(
      `Cloudflare ${operation} failed with HTTP ${response.status} (${details})`,
    );
  }
  if (payload?.success !== true || payload.result == null) {
    const details = redactSecrets(formatApiErrors(payload), [config.apiToken]);
    throw new Error(`Cloudflare ${operation} failed (${details})`);
  }

  return payload;
}

export async function getCurrentProduction(config, options = {}) {
  const payload = await requestCloudflare(
    config,
    "GET",
    projectPath(config),
    "project lookup",
    options,
  );
  return parseCanonicalProduction(payload);
}

export async function getProductionDeployment(
  config,
  deploymentId,
  expectedCommitHash,
  options = {},
) {
  const normalizedId = requireNonEmptyString(deploymentId, "deployment id");
  const payload = await requestCloudflare(
    config,
    "GET",
    `${projectPath(config)}/deployments/${safePathSegment(normalizedId, "deployment id")}`,
    "deployment lookup",
    options,
  );
  return parseProductionDeployment(payload, normalizedId, expectedCommitHash);
}

const sleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

export async function rollbackProduction(
  config,
  deploymentId,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollAttempts = DEFAULT_ROLLBACK_POLL_ATTEMPTS,
    pollDelayMs = DEFAULT_ROLLBACK_POLL_DELAY_MS,
    sleepImpl = sleep,
  } = {},
) {
  const normalizedId = requireNonEmptyString(deploymentId, "deployment id");
  const requestOptions = { fetchImpl, timeoutMs };
  try {
    const current = await getCurrentProduction(config, requestOptions);
    if (current.id === normalizedId) {
      return { deployment: current, changed: false };
    }
  } catch {
    // The known-good target was captured before production changed. A transient
    // read failure must not prevent the best-effort rollback POST below.
  }

  let rollbackRequestError;
  try {
    const payload = await requestCloudflare(
      config,
      "POST",
      `${projectPath(config)}/deployments/${safePathSegment(normalizedId, "deployment id")}/rollback`,
      "rollback",
      requestOptions,
    );
    validateProductionDeployment(parseApiResult(payload, "rollback"), {
      expectedId: normalizedId,
    });
  } catch (error) {
    // A timeout can happen after Cloudflare accepted the POST. The canonical
    // deployment check below resolves that ambiguity without repeating a
    // mutating request.
    rollbackRequestError = error;
  }

  const attempts = Math.max(1, Number.parseInt(String(pollAttempts), 10) || 1);
  let lastLookupError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const restored = await getCurrentProduction(config, requestOptions);
      if (restored.id === normalizedId) {
        return { deployment: restored, changed: true };
      }
    } catch (error) {
      lastLookupError = error;
    }

    if (attempt < attempts) {
      await sleepImpl(pollDelayMs);
    }
  }

  if (rollbackRequestError instanceof Error) {
    throw new Error(
      `Cloudflare rollback was not verified: ${rollbackRequestError.message}`,
    );
  }
  if (lastLookupError instanceof Error) {
    throw new Error(
      `Cloudflare rollback was accepted but canonical deployment verification failed: ${lastLookupError.message}`,
    );
  }
  throw new Error(
    `Cloudflare rollback was accepted but ${normalizedId} did not become canonical`,
  );
}

function usage() {
  return [
    "Usage:",
    "  node scripts/cloudflare-pages-release.mjs current-production",
    "  node scripts/cloudflare-pages-release.mjs verify-production <deployment-id> <commit-sha>",
    "  node scripts/cloudflare-pages-release.mjs rollback <deployment-id>",
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  const config = readCloudflareConfig();

  if (command === "current-production" && args.length === 0) {
    const deployment = await getCurrentProduction(config);
    process.stdout.write(`${deployment.id}\n`);
    return;
  }

  if (command === "verify-production" && args.length === 2) {
    const deployment = await getProductionDeployment(config, args[0], args[1]);
    process.stdout.write(`${deployment.url}\n`);
    return;
  }

  if (command === "rollback" && args.length === 1) {
    const result = await rollbackProduction(config, args[0]);
    process.stdout.write(
      `Cloudflare production ${result.changed ? "restored" : "already set"} to ${result.deployment.id}\n`,
    );
    return;
  }

  throw new Error(usage());
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = redactSecrets(
      error instanceof Error ? error.message : "unknown error",
      [process.env.CLOUDFLARE_API_TOKEN],
    );
    console.error(message);
    process.exitCode = 1;
  });
}
