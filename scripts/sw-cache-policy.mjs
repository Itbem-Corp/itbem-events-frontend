import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Published path of the helper script the service worker imports. */
export const SW_CACHE_POLICY_SCRIPT = "sw-cache-policy.js";

const POLICY_SOURCE = fileURLToPath(
  new URL("../src/lib/apiCachePolicy.mjs", import.meta.url),
);

/**
 * Workbox serialises each `runtimeCaching[].urlPattern` with toString(), so
 * the matchers from apiCachePolicy.mjs reach sw.js without the helpers they
 * call (`shouldUseApiRuntimeCache`, …) or the `eventsUrl` they close over.
 * This builds a classic script, loaded first through `importScripts`, that
 * defines those helpers and `eventsUrl` globally. The module has no imports,
 * so dropping `export` is enough to turn it into a classic script.
 */
export function buildServiceWorkerCachePolicyScript(eventsUrl) {
  const source = readFileSync(POLICY_SOURCE, "utf8");
  if (/^\s*import\s/m.test(source)) {
    throw new Error("apiCachePolicy.mjs must stay import-free: the service worker loads it as a classic script");
  }
  return [
    "// Generated at build time from src/lib/apiCachePolicy.mjs. Do not edit.",
    source.replace(/^export\s+/gm, ""),
    `var eventsUrl = ${JSON.stringify(String(eventsUrl ?? ""))};`,
    "",
  ].join("\n");
}
