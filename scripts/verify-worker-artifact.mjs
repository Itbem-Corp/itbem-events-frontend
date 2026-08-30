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
assert(
  config.limits?.cpu_ms === undefined,
  "The Workers Free plan rejects configurable CPU limits; rely on its platform-enforced CPU cap.",
);
assert(config.preview_urls === true, "Version preview URLs must stay enabled.");
assert(
  Array.isArray(config.compatibility_flags) && config.compatibility_flags.includes("nodejs_compat"),
  "Worker artifact must enable nodejs_compat for the Astro runtime.",
);
const sessionBinding = config.kv_namespaces?.find(
  (binding) => binding.binding === "SESSION",
);
assert(sessionBinding, "Worker artifact must retain the SESSION KV binding.");
assert(
  typeof sessionBinding.id === "string" && sessionBinding.id.length > 0,
  "Worker artifact must pin SESSION to its provisioned KV namespace.",
);

console.log("Worker artifact contract passed.");
