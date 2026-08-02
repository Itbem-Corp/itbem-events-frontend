import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const outputRoot = resolve("dist");
const configPath = resolve(outputRoot, "server", "wrangler.json");
const clientPath = resolve(outputRoot, "client");

if (!existsSync(configPath)) {
  throw new Error("Worker artifact is missing dist/server/wrangler.json; run npm run build first.");
}
if (!existsSync(clientPath)) {
  throw new Error("Worker artifact is missing dist/client static assets.");
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(config.main === "entry.mjs", "Worker entrypoint must remain entry.mjs.");
assert(config.assets?.directory === "../client", "Static assets must stay outside Worker execution.");
assert(config.limits?.cpu_ms === 10, "Worker CPU limit must remain 10 ms.");
assert(config.preview_urls === true, "Version preview URLs must stay enabled.");
assert(
  Array.isArray(config.compatibility_flags) && config.compatibility_flags.includes("nodejs_compat"),
  "Worker artifact must enable nodejs_compat for the Astro runtime.",
);
assert(
  config.kv_namespaces?.some((binding) => binding.binding === "SESSION"),
  "Worker artifact must retain the SESSION KV binding.",
);

console.log("Worker artifact contract passed.");
